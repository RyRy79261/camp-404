import type Anthropic from "@anthropic-ai/sdk";
import {
  VOICE_REPLY_TOOLS,
  voiceCommandPrompt,
  type VoiceCommandContext,
} from "@camp404/ai-prompts";
import { MODELS } from "../anthropic";
import {
  compactResult,
  inputJsonSchema,
  type ToolCallResult,
  type VoiceTool,
} from "./tools";

// The command loop (#356): Claude Sonnet 5.5 reads the camp through the
// captain's own connector tools and replies with the changes it proposes.
//
//  - Reads run in the loop (all of one turn's at once). A write is never run
//    here: its call is the proposal. The turn with no read in it ends the loop.
//  - Sonnet 5.5's API rules: forced tool_choice is a 400, so tool_choice is
//    auto, the reply tools are strict, and a reply with no tool call gets one
//    nudge; thinking cannot be switched off, so adaptive thinking at effort
//    medium with room in max_tokens; the history is append-only (assistant
//    turns sent back unchanged), as preserved thinking needs.
//  - At most five calls and forty seconds; no automatic retries (the client
//    is built with maxRetries 0), and no fallback to another model.
//  - A `refusal` stop ends the command with a sentence; nothing is proposed.
//
// What goes to Anthropic: the prompt, the tools, the context lines and the
// words. Not the audio. Nothing of the call is kept on our side.

export const MAX_CALLS = 5;
export const DEADLINE_MS = 40_000;
export const MAX_ACTIONS = 5;
export const MAX_ANSWERS = 3;

/** The part of the Anthropic client the loop uses (the fake implements it). */
export interface ClaudeClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; timeout?: number },
    ): Promise<Anthropic.Message>;
  };
}

export interface Proposed {
  tool: string;
  args: unknown;
}

export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ReadRecord {
  tool: string;
  args: unknown;
  data: unknown;
}

export type LoopOutcome =
  | {
      kind: "reply";
      /** The write calls, in order, with the ask's place marked. */
      writes: Proposed[];
      ask: { question: string; options: Proposed[]; index: number } | null;
      answers: { text: string; path: string | null }[];
      cannot: { what: string; path: string } | null;
      unsure: string | null;
      /** Anything Claude called that is not a tool it has. */
      unknown: string[];
      reads: ReadRecord[];
      usage: Usage;
    }
  | {
      kind: "error";
      code: "no_reply" | "refusal" | "timeout" | "claude_down" | "too_long";
      reads: ReadRecord[];
      usage: Usage;
    };

export interface LoopInput {
  context: VoiceCommandContext;
  tools: readonly VoiceTool[];
  websitePaths: readonly string[];
  claude: ClaudeClient;
  /** Runs one read tool as the captain (lib/voice/tools callTool). */
  callRead: (tool: string, args: unknown) => Promise<ToolCallResult>;
  now?: () => number;
}

/**
 * The tools as Claude gets them: the reply tools first (the same bytes on
 * every command), then the camp tools of the picked areas in the table's
 * fixed order, so one set of areas is always one cache entry.
 */
export function requestTools(
  tools: readonly VoiceTool[],
  websitePaths: readonly string[],
): Anthropic.Tool[] {
  const reply = voiceCommandPrompt.replyTools(websitePaths) as Anthropic.Tool[];
  const camp: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: inputJsonSchema(t) as Anthropic.Tool.InputSchema,
  }));
  return [...reply, ...camp];
}

/**
 * The system prompt with the stable prefix's breakpoint on it: the API
 * renders tools, then system, so this one marker caches both (Sonnet 5.5
 * caches a prefix of 512 tokens or more). The per-command context comes after
 * it, in the first user message.
 */
const SYSTEM: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: voiceCommandPrompt.system,
    cache_control: { type: "ephemeral" },
  },
];

const NOT_YET =
  "Not done: read first. Send the changes again in a turn of their own, after the reads come back.";

export async function runCommandLoop(input: LoopInput): Promise<LoopOutcome> {
  const now = input.now ?? Date.now;
  const started = now();
  const byName = new Map(input.tools.map((t) => [t.name, t]));
  const tools = requestTools(input.tools, input.websitePaths);
  const replyNames = new Set<string>(Object.values(VOICE_REPLY_TOOLS));
  const usage: Usage = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const reads: ReadRecord[] = [];
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: voiceCommandPrompt.context(input.context) },
  ];
  let nudged = false;

  while (usage.calls < MAX_CALLS) {
    const left = DEADLINE_MS - (now() - started);
    if (left <= 0) return { kind: "error", code: "timeout", reads, usage };
    let response: Anthropic.Message;
    try {
      response = await input.claude.messages.create(
        {
          model: MODELS.sonnet,
          max_tokens: 16_000,
          system: SYSTEM,
          tools,
          tool_choice: { type: "auto" },
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          messages,
          // Automatic caching for the growing tail: each call of the loop
          // reads the one before it from the cache. (Not in this SDK's
          // types yet; the API takes it.)
          ...({ cache_control: { type: "ephemeral" } } as object),
        },
        { timeout: left, signal: AbortSignal.timeout(left) },
      );
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const timedOut =
        name === "TimeoutError" ||
        name === "AbortError" ||
        name === "APIConnectionTimeoutError";
      return {
        kind: "error",
        code: timedOut ? "timeout" : "claude_down",
        reads,
        usage,
      };
    }
    usage.calls += 1;
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      return { kind: "error", code: "refusal", reads, usage };
    }
    if (response.stop_reason === "max_tokens") {
      return { kind: "error", code: "too_long", reads, usage };
    }
    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    // Sent back unchanged, whatever comes next (preserved thinking).
    messages.push({ role: "assistant", content: response.content });

    if (calls.length === 0) {
      if (nudged) return { kind: "error", code: "no_reply", reads, usage };
      nudged = true;
      messages.push({ role: "user", content: voiceCommandPrompt.nudge });
      continue;
    }

    const readCalls = calls.filter((c) => byName.get(c.name)?.kind === "read");
    if (readCalls.length > 0) {
      const results = await Promise.all(
        calls.map(async (c): Promise<Anthropic.ToolResultBlockParam> => {
          if (byName.get(c.name)?.kind !== "read") {
            return {
              type: "tool_result",
              tool_use_id: c.id,
              is_error: true,
              content: NOT_YET,
            };
          }
          const result = await input.callRead(c.name, c.input);
          if (result.ok)
            reads.push({ tool: c.name, args: c.input, data: result.data });
          return {
            type: "tool_result",
            tool_use_id: c.id,
            ...(result.ok
              ? { content: JSON.stringify(compactResult(result.data)) }
              : { is_error: true, content: result.error }),
          };
        }),
      );
      messages.push({ role: "user", content: results });
      continue;
    }

    return { ...finalTurn(calls, byName, replyNames), reads, usage };
  }
  return { kind: "error", code: "timeout", reads, usage };
}

/** The reply turn, read in order: writes, the ask's place, answers, refusals. */
function finalTurn(
  calls: readonly Anthropic.ToolUseBlock[],
  byName: ReadonlyMap<string, VoiceTool>,
  replyNames: ReadonlySet<string>,
): Omit<Extract<LoopOutcome, { kind: "reply" }>, "reads" | "usage"> {
  const writes: Proposed[] = [];
  const answers: { text: string; path: string | null }[] = [];
  const unknown: string[] = [];
  let ask: { question: string; options: Proposed[]; index: number } | null =
    null;
  let cannot: { what: string; path: string } | null = null;
  let unsure: string | null = null;
  let asks = 0;
  for (const call of calls) {
    const input = (call.input ?? {}) as Record<string, unknown>;
    if (byName.get(call.name)?.kind === "write") {
      writes.push({ tool: call.name, args: call.input });
      continue;
    }
    if (!replyNames.has(call.name)) {
      unknown.push(call.name);
      continue;
    }
    switch (call.name) {
      case VOICE_REPLY_TOOLS.answer:
        answers.push({
          text: String(input.text ?? ""),
          path: typeof input.path === "string" ? input.path : null,
        });
        break;
      case VOICE_REPLY_TOOLS.ask: {
        asks += 1;
        const options = Array.isArray(input.options)
          ? input.options.map((o: { tool?: unknown; args_json?: unknown }) => {
              let args: unknown;
              try {
                args = JSON.parse(String(o?.args_json ?? "null"));
              } catch {
                args = null;
              }
              return { tool: String(o?.tool ?? ""), args };
            })
          : [];
        ask = {
          question: String(input.question ?? ""),
          options,
          index: writes.length,
        };
        break;
      }
      case VOICE_REPLY_TOOLS.cannot:
        cannot = {
          what: String(input.what ?? ""),
          path: String(input.path ?? ""),
        };
        break;
      case VOICE_REPLY_TOOLS.unsure:
        unsure = String(input.reason ?? "");
        break;
    }
  }
  if (asks > 1) {
    unsure = unsure ?? "More than one thing needs a question.";
    ask = null;
  }
  return { kind: "reply", writes, ask, answers, cannot, unsure, unknown };
}
