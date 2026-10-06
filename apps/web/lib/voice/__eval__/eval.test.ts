// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";

// The voice eval (#356, "no mistakes"). Two modes:
//
//  - CI (default): every case runs the whole pipeline (tools, server checks,
//    previews, sealing) against a fake Claude that replays what the real
//    model answered in the last recorded run. Each case must grade as it did
//    then, and the set must meet the bar: no wrong action, 90% exact, at most
//    10% needless questions or refusals.
//  - Live (`pnpm --filter @camp404/web eval:voice`, VOICE_EVAL_LIVE=1, needs
//    ANTHROPIC_API_KEY): the real model, Claude Sonnet 5.5. Writes the
//    recordings and a report under ./runs. Run it three times; the bar holds
//    in every run before a prompt or model change merges.

process.env.PGCRYPTO_KEY ??= "test-pgcrypto-key-at-least-16-chars";

vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/lib/camp-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/camp-calendar")>()),
  getUpcomingEvents: vi.fn(async () => ({
    status: "ok",
    events: (await import("./camp")).CALENDAR_EVENTS,
  })),
}));

import { getMcpScope } from "@/lib/mcp/scope";
import { replayClaude } from "../claude-fake";
import type { ClaudeClient, Usage } from "../command";
import { sealKey } from "../seal";
import { runVoiceCommand } from "../service";
import { SPEAKER, seedEvalCamp } from "./camp";
import { CASES } from "./cases";
import { gradeCase, meetsBar, tally, type Grade } from "./grade";

const LIVE = process.env.VOICE_EVAL_LIVE === "1";
/** A comma list of case ids, to try a few against the real model. */
const ONLY = process.env.VOICE_EVAL_ONLY?.split(",").filter(Boolean) ?? null;

if (LIVE && !process.env.ANTHROPIC_API_KEY) {
  // The key only, from the app's local env file; nothing else of it.
  const file = fileURLToPath(new URL("../../../.env.local", import.meta.url));
  if (existsSync(file)) {
    const { parseEnv } = await import("node:util");
    const key = parseEnv(readFileSync(file, "utf8")).ANTHROPIC_API_KEY;
    if (key) process.env.ANTHROPIC_API_KEY = key;
  }
}
const HERE = fileURLToPath(new URL(".", import.meta.url));
const RECORDINGS = `${HERE}recordings.json`;
const NOW = new Date("2026-10-06T12:30:00+02:00");
const SESSION = "eval-session";

interface Recorded {
  grade: Grade;
  replies: Anthropic.Message[];
}

/** What a reply keeps for replay: the calls and text, not the thinking. */
function slim(m: Anthropic.Message): Anthropic.Message {
  return {
    ...m,
    content: m.content.filter(
      (b) => b.type === "tool_use" || b.type === "text",
    ),
  };
}

function recording(
  real: ClaudeClient,
  into: Anthropic.Message[],
): ClaudeClient {
  return {
    messages: {
      async create(body, options) {
        const reply = await real.messages.create(body, options);
        into.push(reply);
        return reply;
      },
    },
  };
}

async function pool<T, R>(
  items: readonly T[],
  size: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

// Sonnet 5.5 list price, dollars per million tokens.
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
const cost = (u: Usage) =>
  (u.inputTokens * PRICE.input +
    u.outputTokens * PRICE.output +
    u.cacheReadTokens * PRICE.cacheRead +
    u.cacheWriteTokens * PRICE.cacheWrite) /
  1_000_000;

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

describe("voice eval", () => {
  it("has the cases the bar asks for", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(100);
    expect(
      CASES.filter((c) => c.area === "claim").length,
    ).toBeGreaterThanOrEqual(15);
    expect(
      CASES.filter((c) => c.area === "team").length,
    ).toBeGreaterThanOrEqual(15);
    const lookAlikeAsks = CASES.filter(
      (c) => c.expect.kind === "ask" && /gecko|gekko|thandi/i.test(c.words),
    );
    expect(lookAlikeAsks.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it(
    LIVE
      ? "runs every case against the real model"
      : "replays every recorded case",
    async () => {
      await seedEvalCamp(h.db());
      const scope = (await getMcpScope(SPEAKER.id))!;
      expect(scope.isCaptain).toBe(true);
      const recorded: Record<string, Recorded> = existsSync(RECORDINGS)
        ? JSON.parse(readFileSync(RECORDINGS, "utf8"))
        : {};
      if (!LIVE) {
        const missing = CASES.filter((c) => !recorded[c.id]).map((c) => c.id);
        expect(missing, "cases with no recording: run eval:voice").toEqual([]);
      }
      const real = LIVE ? (await import("../service")).voiceClaude() : null;
      const who = { userId: scope.campUserId, sessionId: SESSION };
      const cases = ONLY ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;
      const results = await pool(cases, LIVE ? 6 : 1, async (c) => {
        const replies: Anthropic.Message[] = [];
        const claude = LIVE
          ? recording(await real!, replies)
          : replayClaude(recorded[c.id]!.replies);
        const { outcome, usage } = await runVoiceCommand({
          scope,
          captainName: SPEAKER.name,
          words: c.words,
          sessionId: SESSION,
          claude,
          now: NOW,
        });
        const grade = gradeCase(c, outcome, sealKey(), who);
        return { c, outcome, usage, grade, replies: replies.map(slim) };
      });

      const t = tally(results.map((r) => r.grade));
      if (LIVE) {
        const spent = results.reduce((s, r) => s + cost(r.usage), 0);
        const calls = results.reduce((s, r) => s + r.usage.calls, 0);
        const report = {
          at: new Date().toISOString(),
          model: "claude-sonnet-5-5",
          tally: t,
          meetsBar: meetsBar(t),
          dollars: Number(spent.toFixed(4)),
          dollarsPerCommand: Number((spent / results.length).toFixed(4)),
          calls,
          tokens: results.reduce(
            (s, r) => ({
              input: s.input + r.usage.inputTokens,
              output: s.output + r.usage.outputTokens,
              cacheRead: s.cacheRead + r.usage.cacheReadTokens,
              cacheWrite: s.cacheWrite + r.usage.cacheWriteTokens,
            }),
            { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          ),
          misses: results
            .filter((r) => r.grade !== "exact")
            .map((r) => ({
              id: r.c.id,
              grade: r.grade,
              words: r.c.words,
              got:
                r.outcome.kind === "refused"
                  ? `refused: ${r.outcome.message}`
                  : r.outcome.kind === "list"
                    ? r.outcome.rows.map((row) => row.sentence)
                    : r.outcome.kind === "ask"
                      ? {
                          question: r.outcome.question,
                          options: r.outcome.options.map(
                            (o) => o.choice.sentence,
                          ),
                          waiting: r.outcome.waiting.map((w) => w.sentence),
                        }
                      : r.outcome.kind,
            })),
        };
        mkdirSync(`${HERE}runs`, { recursive: true });
        writeFileSync(
          `${HERE}runs/${report.at.replace(/[:.]/g, "-")}.json`,
          `${JSON.stringify(report, null, 2)}\n`,
        );
        if (ONLY) {
          console.log(
            JSON.stringify(
              {
                tally: t,
                dollars: report.dollars,
                misses: report.misses,
                outcomes: results.map((r) => ({
                  id: r.c.id,
                  grade: r.grade,
                  outcome: r.outcome,
                  replies: r.replies.map((m) => m.content),
                })),
              },
              null,
              2,
            ),
          );
          return;
        }
        writeFileSync(
          RECORDINGS,
          `${JSON.stringify(Object.fromEntries(results.map((r) => [r.c.id, { grade: r.grade, replies: r.replies }])), null, 1)}\n`,
        );
        console.log(
          JSON.stringify(
            { tally: t, dollars: report.dollars, misses: report.misses },
            null,
            2,
          ),
        );
        return;
      }
      for (const r of results) {
        expect(r.grade, `${r.c.id}: "${r.c.words}"`).toBe(
          recorded[r.c.id]!.grade,
        );
      }
      expect(t.wrong).toBe(0);
      expect(meetsBar(t)).toBe(true);
    },
    LIVE ? 3_600_000 : 300_000,
  );
});
