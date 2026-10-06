import type Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "./command";

// Scripted stand-ins for Claude (#356). Never the real API: the eval's CI
// replay plays back what the real model answered (lib/voice/__eval__), and
// Playwright plays the scripts below, which read the camp through the same
// tools the real model would and answer from what came back.

type Block = Anthropic.ContentBlock;

let seq = 0;
export function toolUse(name: string, input: unknown): Anthropic.ToolUseBlock {
  seq += 1;
  return {
    type: "tool_use",
    id: `toolu_fake_${seq}`,
    name,
    input,
    caller: { type: "direct" },
  } as Anthropic.ToolUseBlock;
}

export function message(content: Block[], stop: Anthropic.StopReason = "tool_use"): Anthropic.Message {
  return {
    id: `msg_fake_${(seq += 1)}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

/** A fake that plays back a fixed list of replies, one per call. */
export function replayClaude(replies: readonly Anthropic.Message[]): ClaudeClient {
  let i = 0;
  return {
    messages: {
      async create() {
        const reply = replies[i];
        i += 1;
        if (!reply) throw new Error("The recording has no more replies.");
        return reply;
      },
    },
  };
}

/** The tool results of the last user turn, by tool name. */
export function lastResults(
  body: Anthropic.MessageCreateParamsNonStreaming,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const msgs = body.messages;
  const user = msgs[msgs.length - 1];
  const assistant = msgs[msgs.length - 2];
  if (!user || !assistant || typeof user.content === "string" || typeof assistant.content === "string") {
    return out;
  }
  const names = new Map<string, string>();
  for (const b of assistant.content) {
    if (b.type === "tool_use") names.set(b.id, b.name);
  }
  for (const b of user.content) {
    if (b.type !== "tool_result") continue;
    const text = typeof b.content === "string" ? b.content : "";
    try {
      out[names.get(b.tool_use_id) ?? "?"] = JSON.parse(text);
    } catch {
      out[names.get(b.tool_use_id) ?? "?"] = text;
    }
  }
  return out;
}

/** A fake that writes each reply from the conversation so far. */
export function scriptedClaude(
  turn: (body: Anthropic.MessageCreateParamsNonStreaming, call: number) => Block[],
): ClaudeClient {
  let call = 0;
  return {
    messages: {
      async create(body) {
        call += 1;
        return message(turn(body, call));
      },
    },
  };
}

// --- The Playwright scripts -------------------------------------------------------

interface ShiftsRead {
  days: { day: string; slots: { slotId: string; shift: string }[] }[];
}
interface TasksRead {
  rows: { id: string; title: string; status: string }[];
}
interface AttendanceRead {
  phases: { phase: string; mine: string | null }[];
}

/** The slot of shift `name` on the Burn's Wednesday, else its first day. */
function slotNamed(read: unknown, name: string): string | null {
  const days = (read as ShiftsRead)?.days ?? [];
  const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
  const ordered = [...days.filter((d) => weekday(d.day) === 3), ...days];
  for (const d of ordered) {
    const slot = d.slots.find((s) => s.shift === name);
    if (slot) return slot.slotId;
  }
  return null;
}

export const E2E_WORDS: Record<string, string> = {
  three:
    "Sign me up for breakfast cooks on Wednesday, move the shade cloth task to done, say I can help on build week, and what's on tomorrow?",
  ask: "Sign me up for breakfast on Wednesday, move the shade cloth task to done, and say I can't make strike.",
  unclear: "",
};

function e2eTurn(script: string) {
  return (body: Anthropic.MessageCreateParamsNonStreaming, call: number): Block[] => {
    if (call === 1) {
      return [
        toolUse("list_shifts", {}),
        toolUse("list_tasks", {}),
        toolUse("get_logistics_attendance", {}),
      ];
    }
    const r = lastResults(body);
    const task = ((r.list_tasks as TasksRead)?.rows ?? []).find((t) =>
      t.title.toLowerCase().includes("shade cloth"),
    );
    const build = ((r.get_logistics_attendance as AttendanceRead)?.phases ?? []).find(
      (p) => p.phase === "build",
    );
    const cooks = slotNamed(r.list_shifts, "Breakfast cooks");
    const washUp = slotNamed(r.list_shifts, "Breakfast wash-up");
    const move = toolUse("move_task", { taskId: task?.id, from: task?.status, to: "done" });
    const help = toolUse("set_my_logistics_attendance", {
      phase: "build",
      answer: "going",
      expected: build?.mine ?? null,
    });
    if (script === "ask") {
      const strike = ((r.get_logistics_attendance as AttendanceRead)?.phases ?? []).find(
        (p) => p.phase === "strike",
      );
      return [
        toolUse("ask", {
          question: "Which breakfast shift on Wednesday?",
          options: [
            { tool: "sign_up_for_shift", args_json: JSON.stringify({ slotId: cooks }) },
            { tool: "sign_up_for_shift", args_json: JSON.stringify({ slotId: washUp }) },
          ],
        }),
        move,
        toolUse("set_my_logistics_attendance", {
          phase: "strike",
          answer: "cant",
          expected: strike?.mine ?? null,
        }),
      ];
    }
    return [
      toolUse("sign_up_for_shift", { slotId: cooks }),
      move,
      help,
      toolUse("answer", {
        text: "Tomorrow: the build-week planning call at 19:00, for the whole camp.",
        path: "/calendar",
      }),
    ];
  };
}

/** The Playwright twin, playing the script the spec chose. */
export async function e2eClaude(): Promise<ClaudeClient> {
  const { voiceTestStore } = await import("../test-store-voice");
  return scriptedClaude(e2eTurn(voiceTestStore.script() ?? "three"));
}
