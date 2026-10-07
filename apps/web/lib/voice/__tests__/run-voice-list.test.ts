// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RateLimitDb from "@camp404/db/rate-limit";
import type * as MeetingNotesLib from "@/lib/meeting-notes";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";

// Do, as the voice panel calls it (audit 2 tests-1 and tests-2): the real
// runVoiceList server action, its real captain check, and the real claim on
// the list in Postgres (PGlite). Only the sign-in is stood in for. Also the
// "change a chapter, then publish it" list (voice-mcp-1), through the real
// guide tools.

process.env.PGCRYPTO_KEY ??= "test-pgcrypto-key-at-least-16-chars";
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "auth-ryno" })),
  getSessionId: vi.fn(async () => SESSION),
}));
vi.mock("@/lib/member-gate", () => ({ resolveMemberState: vi.fn() }));
vi.mock("@/lib/manifest-revalidate", () => ({ revalidateManifest: vi.fn() }));
// The connector's update_meeting_notes saves, then reads the note again: a
// hook here lets a test land someone else's save in between.
const between = vi.hoisted(() => ({
  save: null as null | (() => Promise<void>),
}));
vi.mock("@/lib/meeting-notes", async (importOriginal) => {
  const real = await importOriginal<typeof MeetingNotesLib>();
  let calls = 0;
  return {
    ...real,
    editMeetingNote: async (
      input: Parameters<typeof real.editMeetingNote>[0],
    ) => {
      const result = await real.editMeetingNote(input);
      calls += 1;
      if (result.ok && calls === 1 && between.save) await between.save();
      return result;
    },
  };
});
vi.mock("@camp404/db/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof RateLimitDb>();
  return { ...real, consumeRateLimit: vi.fn(real.consumeRateLimit) };
});

import { consumeRateLimit } from "@camp404/db/rate-limit";
import { getMcpScope } from "@/lib/mcp/scope";
import { resolveMemberState } from "@/lib/member-gate";
import { runVoiceList } from "@/app/(console)/voice-actions";
import { scriptedClaude, toolUse } from "../claude-fake";
import { PREVIEWS, type Preview } from "../previews";
import type { VoiceOutcome } from "../resolve";
import { runSealedList } from "../run";
import { voiceRunDeps } from "../run-deps";
import { sealKey, sealProposal } from "../seal";
import { runVoiceCommand } from "../service";
import { PEOPLE, SPEAKER, seedEvalCamp, slot } from "../__eval__/camp";

const SESSION = "session-ryno";
const THU = "2027-04-29";

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

function signedInAs(
  rank: "captain" | "member",
  block: unknown = null,
  id: string = SPEAKER.id,
) {
  vi.mocked(resolveMemberState).mockResolvedValue({
    kind: "member",
    authUser: { id: "auth-ryno" },
    campUser: { id, rank },
    block,
  } as never);
}

/** "Take me off dinner cooks on Thursday", as a sealed list for the speaker. */
async function leaveList(): Promise<string> {
  const scope = (await getMcpScope(SPEAKER.id))!;
  const { outcome } = await runVoiceCommand({
    scope,
    captainName: SPEAKER.name,
    words: "Take me off dinner cooks on Thursday",
    sessionId: SESSION,
    claude: scriptedClaude((_body, call) =>
      call === 1
        ? [toolUse("list_my_shifts", {})]
        : [toolUse("leave_shift", { slotId: slot("dinnerCooks", THU) })],
    ),
  });
  expect(outcome.kind).toBe("list");
  return (outcome as Extract<VoiceOutcome, { kind: "list" }>).token;
}

async function onDinnerThursday(): Promise<boolean> {
  const rows = await h
    .db()
    .select()
    .from(schema.shiftSignups)
    .where(eq(schema.shiftSignups.userId, SPEAKER.id));
  return rows.some((r) => r.slotId === slot("dinnerCooks", THU));
}

beforeEach(() => {
  vi.mocked(resolveMemberState).mockReset();
  vi.mocked(consumeRateLimit).mockClear();
});

describe("runVoiceList", () => {
  it("runs a captain's list once, claimed in Postgres, and refuses the second Do", async () => {
    await seedEvalCamp(h.db());
    const token = await leaveList();
    signedInAs("captain");
    const first = await runVoiceList(token, [0]);
    expect(first.ok && first.results.map((r) => r.status)).toEqual(["done"]);
    expect(await onDinnerThursday()).toBe(false);
    expect(vi.mocked(consumeRateLimit)).toHaveBeenCalledTimes(1);
    // A claim that comes back with no row is not a claim: nothing runs.
    expect(vi.mocked(consumeRateLimit)).toHaveBeenCalledWith(
      expect.objectContaining({ noRow: "unknown" }),
    );

    expect(await runVoiceList(token, [0])).toEqual({
      ok: false,
      message: "That list has already run. Nothing ran twice.",
    });
  });

  it("runs nothing when the claim cannot be stored, and the list still runs later", async () => {
    await seedEvalCamp(h.db());
    const token = await leaveList();
    signedInAs("captain");
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(null);
    expect(await runVoiceList(token, [0])).toEqual({
      ok: false,
      message:
        "Voice could not check that list just now. Nothing ran: press Do again.",
    });
    expect(await onDinnerThursday()).toBe(true);

    const again = await runVoiceList(token, [0]);
    expect(again.ok && again.results.map((r) => r.status)).toEqual(["done"]);
    expect(await onDinnerThursday()).toBe(false);
  });

  it("refuses a member, a held captain and a captain demoted since the list was made", async () => {
    await seedEvalCamp(h.db());
    const token = await leaveList();
    const refused = {
      ok: false,
      message: "Voice is for captains. Nothing ran.",
    };

    signedInAs("member");
    expect(await runVoiceList(token, [0])).toEqual(refused);
    signedInAs("captain", {
      reason: "questionnaire",
      href: "/questionnaires/x",
    });
    expect(await runVoiceList(token, [0])).toEqual(refused);

    // The session still says captain; the database no longer does.
    await h
      .db()
      .update(schema.users)
      .set({ rank: "member" })
      .where(eq(schema.users.id, SPEAKER.id));
    signedInAs("captain");
    expect(await runVoiceList(token, [0])).toEqual(refused);
    expect(await onDinnerThursday()).toBe(true);
    // None of them claimed the list.
    expect(vi.mocked(consumeRateLimit)).not.toHaveBeenCalled();
  });

  it("refuses another captain's list", async () => {
    await seedEvalCamp(h.db());
    const token = await leaveList();
    signedInAs("captain", null, PEOPLE.mpho.id);
    expect(await runVoiceList(token, [0])).toEqual({
      ok: false,
      message: "That list was made for another sign-in. Nothing ran.",
    });
    expect(await onDinnerThursday()).toBe(true);
  });
});

/** A sealed list: the change, then the publish, which needs it. */
function editThenPublish(update: Preview, publish: Preview): string {
  const row = (tool: string, p: Preview, dependsOn: number | null) => ({
    tool,
    args: p.args,
    sentence: p.sentence,
    facts: p.facts,
    path: p.path,
    dependsOn,
  });
  return sealProposal(
    {
      userId: SPEAKER.id,
      sessionId: SESSION,
      actions: [
        row("update_document", update, null),
        row("publish_document", publish, 0),
      ],
    },
    sealKey(),
  ).token;
}

describe("change a chapter, then publish it, on one list", () => {
  it("publishes the change the captain just made, and still refuses someone else's save", async () => {
    await seedEvalCamp(h.db());
    await h.db().insert(schema.documents).values({
      title: "Water",
      slug: "water",
      category: "on_site",
      markdown: "Bring 5 litres a day.",
      authorId: SPEAKER.id,
    });
    const scope = (await getMcpScope(SPEAKER.id))!;
    const ctx = { scope, now: new Date("2026-10-07T10:00:00Z") };
    const update = await PREVIEWS.update_document!(
      { slug: "water", markdown: "Bring 6 litres a day." },
      ctx,
    );
    const publish = await PREVIEWS.publish_document!(
      { slug: "water", published: true },
      ctx,
    );
    const deps = voiceRunDeps({ userId: SPEAKER.id, sessionId: SESSION });

    const run = await runSealedList(
      editThenPublish(update, publish),
      [0, 1],
      deps,
    );
    expect(run.ok && run.results.map((r) => [r.status, r.detail])).toEqual([
      ["done", null],
      ["done", null],
    ]);
    const [doc] = await h
      .db()
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.slug, "water"));
    expect(doc).toMatchObject({
      version: 2,
      published: true,
      markdown: "Bring 6 litres a day.",
    });

    // Someone saves between the change and the publish: the publish is
    // refused, as before. The same list, sealed again from version 2's read.
    const [update2, publish2] = await Promise.all([
      PREVIEWS.update_document!({ slug: "water", markdown: "Bring 7." }, ctx),
      PREVIEWS.publish_document!({ slug: "water", published: true }, ctx),
    ]);
    let saves = 0;
    const racing = {
      ...deps,
      call: async (tool: string, args: unknown, userId: string) => {
        const result = await deps.call(tool, args, userId);
        if (tool === "update_document" && saves++ === 0) {
          await h
            .db()
            .update(schema.documents)
            .set({ version: 4, markdown: "Someone else's words." })
            .where(eq(schema.documents.slug, "water"));
        }
        return result;
      },
    };
    const raced = await runSealedList(
      editThenPublish(update2, publish2),
      [0, 1],
      racing,
    );
    expect(raced.ok && raced.results.map((r) => r.status)).toEqual([
      "done",
      "not_done",
    ]);
  });
});

describe("two changes to one meeting's notes, on one list", () => {
  it("carries the version the first save made, so a save landing between refuses the second", async () => {
    await seedEvalCamp(h.db());
    const [note] = await h
      .db()
      .insert(schema.meetingNotes)
      .values({
        cycle: 1,
        team: null,
        title: "Build planning",
        heldAt: new Date("2026-10-01T16:00:00Z"),
        agenda: "Shade",
        notes: "",
        createdByUserId: SPEAKER.id,
      })
      .returning();
    const scope = (await getMcpScope(SPEAKER.id))!;
    const ctx = { scope, now: new Date("2026-10-07T10:00:00Z") };
    const first = await PREVIEWS.update_meeting_notes!(
      { meetingId: note!.id, agenda: "Shade and water" },
      ctx,
    );
    const second = await PREVIEWS.update_meeting_notes!(
      { meetingId: note!.id, notes: "Ryno buys the shade cloth." },
      ctx,
    );
    // Someone else saves right after the first save, before it reads back.
    between.save = async () => {
      await h
        .db()
        .update(schema.meetingNotes)
        .set({ notes: "Mpho's notes.", version: 3 })
        .where(eq(schema.meetingNotes.id, note!.id));
    };
    const row = (p: Preview, dependsOn: number | null) => ({
      tool: "update_meeting_notes",
      args: p.args,
      sentence: p.sentence,
      facts: p.facts,
      path: p.path,
      dependsOn,
    });
    const token = sealProposal(
      {
        userId: SPEAKER.id,
        sessionId: SESSION,
        actions: [row(first, null), row(second, 0)],
      },
      sealKey(),
    ).token;
    const run = await runSealedList(
      token,
      [0, 1],
      voiceRunDeps({ userId: SPEAKER.id, sessionId: SESSION }),
    );
    between.save = null;
    expect(run.ok && run.results.map((r) => r.status)).toEqual([
      "done",
      "not_done",
    ]);
    const [after] = await h
      .db()
      .select()
      .from(schema.meetingNotes)
      .where(eq(schema.meetingNotes.id, note!.id));
    // Mpho's save stands.
    expect(after).toMatchObject({ notes: "Mpho's notes.", version: 3 });
  });
});
