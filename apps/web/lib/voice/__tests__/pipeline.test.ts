// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { SHIFT_NOT_ON } from "@camp404/db/shifts";
import { TASK_MOVED } from "@camp404/db/tasks";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";

// The voice pipeline against real Postgres (PGlite), through the connector's
// real tool handlers (#356): Claude is scripted; everything after it is the
// production code. Seeded with the eval camp (fixed ids).

process.env.PGCRYPTO_KEY ??= "test-pgcrypto-key-at-least-16-chars";
vi.mock("next/server", () => ({ after: () => undefined }));

import { getMcpScope } from "@/lib/mcp/scope";
import { rateLimiter } from "@/lib/rate-limit";
import { lastResults, scriptedClaude, toolUse } from "../claude-fake";
import type { ClaudeClient } from "../command";
import { SAY_AGAIN, type VoiceOutcome } from "../resolve";
import { runSealedList } from "../run";
import { PROPOSAL_TTL_MS, sealKey } from "../seal";
import { runVoiceCommand } from "../service";
import { callTool, toolsFor, VOICE_CLIENT_ID } from "../tools";
import { PEOPLE, SPEAKER, TASKS, seedEvalCamp, slot } from "../__eval__/camp";

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();
const SESSION = "session-ryno";
const WED = "2027-04-28";

afterEach(() => vi.restoreAllMocks());

/** Reads first, then the given writes (built from what the reads returned). */
function claude(
  reads: string[],
  writes: (r: Record<string, unknown>) => ReturnType<typeof toolUse>[],
): ClaudeClient {
  return scriptedClaude((body, call) =>
    call === 1 ? reads.map((t) => toolUse(t, {})) : writes(lastResults(body)),
  );
}

async function command(
  words: string,
  c: ClaudeClient,
  who = SPEAKER.id,
  session = SESSION,
) {
  const scope = (await getMcpScope(who))!;
  return (
    await runVoiceCommand({
      scope,
      captainName: "Ryno Steyn",
      words,
      sessionId: session,
      claude: c,
    })
  ).outcome;
}

function runDeps(who: { userId: string; sessionId: string }) {
  return {
    key: sealKey(),
    who,
    stillCaptain: async () =>
      (await getMcpScope(who.userId))?.isCaptain === true,
    spend: async (id: string) =>
      (
        await rateLimiter.limit(`voice-proposal:${id}`, {
          limit: 1,
          windowMs: PROPOSAL_TTL_MS * 2,
        })
      ).ok,
    call: callTool,
  };
}

async function auditRows() {
  return h
    .db()
    .select({
      tool: schema.mcpAuditLog.tool,
      outcome: schema.mcpAuditLog.outcome,
      clientId: schema.mcpAuditLog.clientId,
      userId: schema.mcpAuditLog.userId,
    })
    .from(schema.mcpAuditLog);
}

const THREE = (r: Record<string, unknown>) => {
  const tasks = (
    r.list_tasks as { rows: { id: string; status: string; title: string }[] }
  ).rows;
  const shade = tasks.find((t) => t.title.includes("shade cloth"))!;
  return [
    toolUse("sign_up_for_shift", { slotId: slot("breakfastCooks", WED) }),
    toolUse("move_task", { taskId: shade.id, from: shade.status, to: "done" }),
    toolUse("set_my_logistics_attendance", {
      phase: "build",
      answer: "going",
      expected: null,
    }),
  ];
};
const THREE_READS = ["list_shifts", "list_tasks", "get_logistics_attendance"];

describe("a captain's voice command, through the connector's own tools", () => {
  it("runs three actions in order; the middle loses its compare-and-set and the other two are saved, each audited", async () => {
    await seedEvalCamp(h.db());
    const outcome = await command("Three things", claude(THREE_READS, THREE));
    expect(outcome.kind).toBe("list");
    const list = outcome as Extract<VoiceOutcome, { kind: "list" }>;
    // The server's sentences, from the rows.
    expect(list.rows.map((r) => r.sentence)).toEqual([
      "Sign you up for Breakfast cooks, Wed 28 Apr 07:00–09:00",
      "Move “Buy 30 m of shade cloth” from Doing to Done",
      "Say you can help on Build, Thu 22 Apr – Sun 25 Apr",
    ]);
    expect(list.rows[0]!.facts).toBe("Shifts · Kitchen · 2 of 4 places taken");

    // Someone moves the task between the list and Do.
    await h
      .db()
      .update(schema.tasks)
      .set({ status: "done" })
      .where(eq(schema.tasks.id, TASKS.shadeCloth.id));

    const run = await runSealedList(
      list.token,
      [0, 1, 2],
      runDeps({ userId: SPEAKER.id, sessionId: SESSION }),
    );
    expect(run.ok && run.results.map((r) => [r.status, r.detail])).toEqual([
      ["done", "2 shifts this year."],
      ["not_done", `${TASK_MOVED} Nothing changed.`],
      ["done", null],
    ]);
    const signups = await h
      .db()
      .select()
      .from(schema.shiftSignups)
      .where(eq(schema.shiftSignups.slotId, slot("breakfastCooks", WED)));
    expect(signups.map((s) => s.userId)).toContain(SPEAKER.id);
    const [answer] = await h
      .db()
      .select()
      .from(schema.logisticsAttendance)
      .where(
        and(
          eq(schema.logisticsAttendance.userId, SPEAKER.id),
          eq(schema.logisticsAttendance.phase, "build"),
        ),
      );
    expect(answer?.answer).toBe("going");

    // Each write has its own audit row, under client "voice", as the captain.
    const audit = (await auditRows()).filter((a) =>
      [
        "sign_up_for_shift",
        "move_task",
        "set_my_logistics_attendance",
      ].includes(a.tool),
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        {
          tool: "sign_up_for_shift",
          outcome: "success",
          clientId: VOICE_CLIENT_ID,
          userId: SPEAKER.id,
        },
        {
          tool: "move_task",
          outcome: "error",
          clientId: VOICE_CLIENT_ID,
          userId: SPEAKER.id,
        },
        {
          tool: "set_my_logistics_attendance",
          outcome: "success",
          clientId: VOICE_CLIENT_ID,
          userId: SPEAKER.id,
        },
      ]),
    );
    expect(audit).toHaveLength(3);

    // And the list runs once.
    expect(
      await runSealedList(
        list.token,
        [0, 1, 2],
        runDeps({ userId: SPEAKER.id, sessionId: SESSION }),
      ),
    ).toEqual({
      ok: false,
      message: "That list has already run. Nothing ran twice.",
    });
  });

  it("skips an action that needs one that failed", async () => {
    await seedEvalCamp(h.db());
    const outcome = await command(
      "Put Kat Jacobs on Kitchen and make her a lead",
      claude(["list_users"], () => [
        toolUse("assign_team_membership", {
          userId: PEOPLE.kat.id,
          team: "kitchen",
        }),
        toolUse("set_team_lead", {
          userId: PEOPLE.kat.id,
          team: "kitchen",
          isLead: true,
        }),
      ]),
    );
    const list = outcome as Extract<VoiceOutcome, { kind: "list" }>;
    expect(list.rows.map((r) => [r.sentence, r.dependsOn])).toEqual([
      ["Put Kat Jacobs on Kitchen for this year", null],
      ["Make Kat Jacobs a lead of Kitchen for this year", 0],
    ]);
    // Kat's account is erased before Do: the first fails, the second waits for it.
    await h
      .db()
      .update(schema.users)
      .set({ sanitised: true })
      .where(eq(schema.users.id, PEOPLE.kat.id));
    const run = await runSealedList(
      list.token,
      [0, 1],
      runDeps({ userId: SPEAKER.id, sessionId: SESSION }),
    );
    expect(run.ok && run.results.map((r) => r.status)).toEqual([
      "not_done",
      "skipped",
    ]);
    const kat = await h
      .db()
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, PEOPLE.kat.id));
    expect(kat).toEqual([]);
  });

  it("refuses a list made by one captain to another captain, and to its maker once they are no longer a captain", async () => {
    await seedEvalCamp(h.db());
    const outcome = await command(
      "Take me off dinner cooks on Thursday",
      claude(["list_my_shifts"], () => [
        toolUse("leave_shift", { slotId: slot("dinnerCooks", "2027-04-29") }),
      ]),
    );
    const list = outcome as Extract<VoiceOutcome, { kind: "list" }>;
    const other = await runSealedList(
      list.token,
      [0],
      runDeps({ userId: PEOPLE.mpho.id, sessionId: "session-mpho" }),
    );
    expect(other).toEqual({
      ok: false,
      message: "That list was made for another sign-in. Nothing ran.",
    });
    const otherSession = await runSealedList(
      list.token,
      [0],
      runDeps({ userId: SPEAKER.id, sessionId: "a-new-sign-in" }),
    );
    expect(otherSession.ok).toBe(false);

    await h
      .db()
      .update(schema.users)
      .set({ rank: "member" })
      .where(eq(schema.users.id, SPEAKER.id));
    const demoted = await runSealedList(
      list.token,
      [0],
      runDeps({ userId: SPEAKER.id, sessionId: SESSION }),
    );
    expect(demoted).toEqual({
      ok: false,
      message: "Voice is for captains. Nothing ran.",
    });
    const still = await h
      .db()
      .select()
      .from(schema.shiftSignups)
      .where(eq(schema.shiftSignups.userId, SPEAKER.id));
    expect(still).toHaveLength(1);
  });

  it("gives a member none of the captain's tools, and the tool's own gate refuses them", async () => {
    await seedEvalCamp(h.db());
    const member = (await getMcpScope(PEOPLE.kat.id))!;
    const names = toolsFor(member).map((t) => t.name);
    expect(names).not.toContain("assign_team_membership");
    expect(names).not.toContain("approve_reimbursement");
    expect(names).toContain("sign_up_for_shift");
    expect(
      await callTool(
        "assign_team_membership",
        { userId: PEOPLE.kat.id, team: "kitchen" },
        PEOPLE.kat.id,
      ),
    ).toEqual({
      ok: false,
      error: "Only a captain can do this.",
    });
    const captain = (await getMcpScope(SPEAKER.id))!;
    expect(toolsFor(captain).map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "assign_team_membership",
        "approve_reimbursement",
        "set_team_lead",
      ]),
    );
  });

  it("refuses a proposal whose id no read returned", async () => {
    await seedEvalCamp(h.db());
    const outcome = await command(
      "Move the dome task to done",
      claude(["list_my_shifts"], () => [
        toolUse("move_task", {
          taskId: TASKS.dome.id,
          from: "open",
          to: "done",
        }),
      ]),
    );
    expect(outcome).toMatchObject({ kind: "refused", message: SAY_AGAIN });
  });

  it("asks which person when two names sound alike, whichever Claude picked", async () => {
    await seedEvalCamp(h.db());
    const outcome = await command(
      "Put Gecko on Kitchen",
      claude(["list_users"], () => [
        toolUse("assign_team_membership", {
          userId: PEOPLE.gecko.id,
          team: "kitchen",
        }),
      ]),
    );
    expect(outcome.kind).toBe("ask");
    const ask = outcome as Extract<VoiceOutcome, { kind: "ask" }>;
    expect(ask.question).toBe("Did you mean Gecko Naidoo or Gekko Naidoo?");
    expect(ask.options.map((o) => o.choice.sentence)).toEqual([
      "Put Gecko Naidoo on Kitchen for this year",
      "Put Gekko Naidoo on Kitchen for this year",
    ]);
  });

  it("keeps nothing of the words: no table and no log line holds them", async () => {
    await seedEvalCamp(h.db());
    const MARKER = "zebrafish-umbrella-marker";
    const logs: unknown[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation(
        (...args: unknown[]) => void logs.push(args),
      );
    }
    const outcome = await command(
      `${MARKER} three things please`,
      claude(THREE_READS, THREE),
    );
    const list = outcome as Extract<VoiceOutcome, { kind: "list" }>;
    await runSealedList(
      list.token,
      [0, 1, 2],
      runDeps({ userId: SPEAKER.id, sessionId: SESSION }),
    );

    const tables = await h
      .client()
      .query<{
        tablename: string;
      }>("select tablename from pg_tables where schemaname = 'public'");
    for (const { tablename } of tables.rows) {
      const rows = await h
        .client()
        .query<{
          row: string;
        }>(`select row_to_json(t)::text as row from "public"."${tablename}" t`);
      for (const r of rows.rows) expect(r.row, tablename).not.toContain(MARKER);
    }
    expect(JSON.stringify(logs)).not.toContain(MARKER);
  });
});

describe("the daily limit", () => {
  it("lets a captain give 30 commands a day, two at once included, and refuses the 31st", async () => {
    await seedEvalCamp(h.db());
    const key = `voice-command:${SPEAKER.id}`;
    const day = { limit: 30, windowMs: 24 * 60 * 60_000 };
    const first = await Promise.all(
      Array.from({ length: 2 }, () => rateLimiter.limit(key, day)),
    );
    expect(first.every((v) => v.ok)).toBe(true);
    for (let i = 0; i < 28; i += 1)
      expect((await rateLimiter.limit(key, day)).ok).toBe(true);
    const over = await Promise.all(
      Array.from({ length: 2 }, () => rateLimiter.limit(key, day)),
    );
    expect(over.map((v) => v.ok)).toEqual([false, false]);
    // Another captain's count is their own.
    expect(
      (await rateLimiter.limit(`voice-command:${PEOPLE.mpho.id}`, day)).ok,
    ).toBe(true);
  });
});

// Unused-import guard for the constant the run's refusal quotes.
void SHIFT_NOT_ON;
