// @vitest-environment node
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { VOICE_REPLY_TOOLS } from "@camp404/ai-prompts";
import { TOOL_CAPABILITIES } from "../../mcp/capabilities";
import { message, toolUse } from "../claude-fake";
import {
  MAX_CALLS,
  runCommandLoop,
  type ClaudeClient,
  type LoopInput,
} from "../command";
import { PREVIEWS } from "../previews";
import type { VoiceTool } from "../tools";

// The loop (#356): reads run, writes never do; Sonnet 5.5's request rules.

const tool = (name: string, kind: "read" | "write"): VoiceTool => ({
  name,
  kind,
  area: "Tasks",
  description: name,
  shape: { id: z.string().optional() },
  handler: vi.fn(),
});
const TOOLS = [tool("list_tasks", "read"), tool("move_task", "write")];

function input(replies: Anthropic.Message[], over: Partial<LoopInput> = {}) {
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const claude: ClaudeClient = {
    messages: {
      async create(body) {
        bodies.push(structuredClone(body));
        const r = replies[i];
        i += 1;
        if (!r) throw new Error("no more");
        return r;
      },
    },
  };
  const callRead = vi.fn(async () => ({
    ok: true as const,
    data: { rows: [{ id: "t1" }] },
  }));
  return {
    bodies,
    callRead,
    input: {
      context: {
        today: "Tuesday 6 October 2026",
        todayKey: "2026-10-06",
        burnYear: null,
        burnDays: null,
        phases: [],
        captainName: "Ryno",
        teams: [],
        words: "move it",
      },
      tools: TOOLS,
      websitePaths: ["/tasks"],
      claude,
      callRead,
      ...over,
    } satisfies LoopInput,
  };
}

describe("the command loop", () => {
  it("runs reads, never a write, and ends on the turn with no read", async () => {
    const t = input([
      message([
        toolUse("list_tasks", {}),
        toolUse("move_task", { id: "early" }),
      ]),
      message([
        toolUse("move_task", { id: "t1" }),
        toolUse(VOICE_REPLY_TOOLS.answer, { text: "Done soon", path: null }),
      ]),
    ]);
    const out = await runCommandLoop(t.input);
    expect(t.callRead).toHaveBeenCalledTimes(1);
    expect(t.callRead).toHaveBeenCalledWith("list_tasks", {});
    // The early write was answered "not done", never run.
    const results = t.bodies[1]!.messages.at(-1)!
      .content as Anthropic.ToolResultBlockParam[];
    expect(results[1]).toMatchObject({ is_error: true });
    expect(out).toMatchObject({
      kind: "reply",
      writes: [{ tool: "move_task", args: { id: "t1" } }],
      answers: [{ text: "Done soon", path: null }],
      reads: [{ tool: "list_tasks" }],
    });
  });

  it("asks Sonnet 5.5 as its rules require: auto tool choice, adaptive thinking at medium, strict reply tools, one cache breakpoint", async () => {
    const t = input([
      message([toolUse(VOICE_REPLY_TOOLS.unsure, { reason: "?" })]),
    ]);
    await runCommandLoop(t.input);
    const body = t.bodies[0]!;
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "medium" });
    const tools = body.tools as Anthropic.Tool[];
    for (const name of Object.values(VOICE_REPLY_TOOLS)) {
      expect(tools.find((x) => x.name === name)?.strict).toBe(true);
    }
    // The reply tools first, the same bytes every time; then the camp's.
    expect(tools.slice(0, 4).map((x) => x.name)).toEqual(
      Object.values(VOICE_REPLY_TOOLS),
    );
    expect(tools.some((x) => x.cache_control)).toBe(false);
    // One breakpoint at the end of the stable prefix (tools, then system),
    // and automatic caching for the conversation's tail.
    expect(body.system).toEqual([
      expect.objectContaining({
        type: "text",
        cache_control: { type: "ephemeral" },
      }),
    ]);
    expect((body as { cache_control?: unknown }).cache_control).toEqual({
      type: "ephemeral",
    });
  });

  it("keeps the history append-only: each turn is sent back unchanged", async () => {
    const first = message([toolUse("list_tasks", {})]);
    const t = input([
      first,
      message([toolUse(VOICE_REPLY_TOOLS.unsure, { reason: "?" })]),
    ]);
    await runCommandLoop(t.input);
    expect(t.bodies[1]!.messages[1]).toEqual({
      role: "assistant",
      content: first.content,
    });
    expect(t.bodies[1]!.messages.slice(0, 1)).toEqual(t.bodies[0]!.messages);
  });

  it("nudges once when a reply has no tool call, then gives up", async () => {
    const text = (s: string) =>
      message(
        [{ type: "text", text: s, citations: null } as Anthropic.TextBlock],
        "end_turn",
      );
    const t = input([text("hm"), text("still")]);
    expect(await runCommandLoop(t.input)).toMatchObject({
      kind: "error",
      code: "no_reply",
    });
    expect(t.bodies).toHaveLength(2);
  });

  it("ends on a refusal, with nothing proposed", async () => {
    const t = input([message([], "refusal")]);
    expect(await runCommandLoop(t.input)).toMatchObject({
      kind: "error",
      code: "refusal",
    });
  });

  it("stops after five calls", async () => {
    const t = input(
      Array.from({ length: 9 }, () => message([toolUse("list_tasks", {})])),
    );
    expect(await runCommandLoop(t.input)).toMatchObject({
      kind: "error",
      code: "timeout",
    });
    expect(t.bodies).toHaveLength(MAX_CALLS);
  });

  it("reads an ask's two options, and where it stands among the changes", async () => {
    const t = input([
      message([
        toolUse("move_task", { id: "a" }),
        toolUse(VOICE_REPLY_TOOLS.ask, {
          question: "Which?",
          options: [
            { tool: "move_task", args_json: '{"id":"x"}' },
            { tool: "move_task", args_json: '{"id":"y"}' },
          ],
        }),
      ]),
    ]);
    expect(await runCommandLoop(t.input)).toMatchObject({
      kind: "reply",
      writes: [{ tool: "move_task", args: { id: "a" } }],
      ask: {
        question: "Which?",
        index: 1,
        options: [{ args: { id: "x" } }, { args: { id: "y" } }],
      },
    });
  });
});

describe("the capability table and the previews", () => {
  it("marks every connector tool read or write, and gives every write a preview", () => {
    const writes = Object.entries(TOOL_CAPABILITIES)
      .filter(([, c]) => c.kind === "write")
      .map(([n]) => n)
      .sort();
    expect(writes.length).toBeGreaterThan(20);
    expect(Object.keys(PREVIEWS).sort()).toEqual(writes);
    for (const c of Object.values(TOOL_CAPABILITIES)) {
      expect(["read", "write"]).toContain(c.kind);
    }
  });
});
