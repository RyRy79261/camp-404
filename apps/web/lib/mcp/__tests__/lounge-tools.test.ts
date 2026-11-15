// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { NOT_YOUR_OFFER, OFFER_CHANGED, OFFER_DECIDED } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import { SETTINGS_CHANGED } from "@camp404/db/lounge";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { LOUNGE_REFUSAL } from "../../lounge-copy";
import { registerLoungeTools } from "../tools/lounge";

// The lounge's connector tools (#269), on real Postgres (PGlite) through the
// real handlers: the Lounge page's own writes for the same person, who may
// and who is refused in what words, the rows and audit rows they leave, and
// the compare-and-set on what the caller read.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerLoungeTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : { data: JSON.parse(text) as Record<string, unknown> };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

async function campYear(year = 2026) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await h
    .db()
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await h
    .db()
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await h
    .db()
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const member = () => makeUser(h.db(), { approvalStatus: "approved" });

async function leadOf(team: Team) {
  const user = await member();
  await assignTeam({ userId: user.id, team });
  await setLead({ userId: user.id, team, isLead: true });
  return user;
}

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

async function offerRow(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.loungeOffers)
    .where(eq(schema.loungeOffers.id, id));
  return row;
}

const SET = {
  title: "Sunset vinyl",
  description: "Deep house on records",
  kind: "dj_set",
  durationMinutes: 90,
  needs: ["sound", "power"],
  preferredDays: [2, 3],
  preferredBands: ["sunset"],
};

describe("lounge offers", () => {
  it("offers in the caller's name and changes only the fields given, at the version read", async () => {
    await campYear();
    const host = await member();
    const made = await call("offer_lounge_activity", SET, host.id);
    expect(made.error).toBeUndefined();
    const id = made.data!.id as string;
    expect(await offerRow(id)).toMatchObject({
      hostId: host.id,
      status: "offered",
      version: 1,
    });

    const { error } = await call(
      "update_my_lounge_offer",
      { offerId: id, expectedVersion: 1, durationMinutes: 120 },
      host.id,
    );
    expect(error).toBeUndefined();
    expect(await offerRow(id)).toMatchObject({
      title: "Sunset vinyl",
      description: "Deep house on records",
      durationMinutes: 120,
      needs: ["sound", "power"],
      preferredDays: [2, 3],
      version: 2,
    });

    const stale = await call(
      "update_my_lounge_offer",
      { offerId: id, expectedVersion: 1, title: "Late vinyl" },
      host.id,
    );
    expect(stale.error).toBe(OFFER_CHANGED);
    expect((await offerRow(id))!.title).toBe("Sunset vinyl");
  });

  it("refuses another member's offer, and a decided one", async () => {
    await campYear();
    const host = await member();
    const other = await member();
    const lead = await leadOf("ministry_of_vibes");
    const id = (await call("offer_lounge_activity", SET, host.id)).data!
      .id as string;

    expect(
      (
        await call(
          "update_my_lounge_offer",
          { offerId: id, expectedVersion: 1, title: "Mine now" },
          other.id,
        )
      ).error,
    ).toBe(NOT_YOUR_OFFER);
    expect(
      (await call("withdraw_my_lounge_offer", { offerId: id }, other.id)).error,
    ).toBe(NOT_YOUR_OFFER);

    await call(
      "decide_lounge_offer",
      {
        offerId: id,
        decision: "accepted",
        expectedStatus: "offered",
        expectedVersion: 1,
      },
      lead.id,
    );
    expect(
      (
        await call(
          "update_my_lounge_offer",
          { offerId: id, expectedVersion: 2, title: "Changed" },
          host.id,
        )
      ).error,
    ).toBe(OFFER_DECIDED);

    // Withdrawing is the host's, whatever the answer: the offer goes.
    expect(
      (await call("withdraw_my_lounge_offer", { offerId: id }, host.id)).error,
    ).toBeUndefined();
    expect(await offerRow(id)).toBeUndefined();
  });
});

describe("running the lounge", () => {
  it("lets only captains and Ministry of Vibes leads decide, place and write the note", async () => {
    await campYear();
    const host = await member();
    const kitchenLead = await leadOf("kitchen");
    const id = (await call("offer_lounge_activity", SET, host.id)).data!
      .id as string;
    const decide = {
      offerId: id,
      decision: "accepted",
      expectedStatus: "offered",
      expectedVersion: 1,
    };
    for (const who of [host, kitchenLead]) {
      expect(
        (await call("decide_lounge_offer", decide, who.id)).error,
      ).toContain(LOUNGE_REFUSAL);
      expect(
        (
          await call(
            "set_lounge_music_note",
            { musicPolicy: "No trance", expectedVersion: 0 },
            who.id,
          )
        ).error,
      ).toContain(LOUNGE_REFUSAL);
    }
    expect((await offerRow(id))!.status).toBe("offered");
    expect(await auditRows("lounge.offer_decided")).toHaveLength(0);
  });

  it("decides on the status and version read, places, and audits each", async () => {
    await campYear();
    const host = await member();
    const lead = await leadOf("ministry_of_vibes");
    const id = (await call("offer_lounge_activity", SET, host.id)).data!
      .id as string;

    const asMember = await call("get_lounge", {}, host.id);
    expect(asMember.data!.allOffers).toBeUndefined();
    const asLead = await call("get_lounge", {}, lead.id);
    expect(asLead.data!.allOffers).toEqual([
      expect.objectContaining({ id, status: "offered", version: 1 }),
    ]);

    const stale = await call(
      "decide_lounge_offer",
      {
        offerId: id,
        decision: "accepted",
        expectedStatus: "needs_changes",
        expectedVersion: 1,
      },
      lead.id,
    );
    expect(stale.error).toBe(OFFER_CHANGED);

    const decided = await call(
      "decide_lounge_offer",
      {
        offerId: id,
        decision: "accepted",
        expectedStatus: "offered",
        expectedVersion: 1,
      },
      lead.id,
    );
    expect(decided.error).toBeUndefined();
    expect(await offerRow(id)).toMatchObject({
      status: "accepted",
      version: 2,
    });
    expect(await auditRows("lounge.offer_decided")).toEqual([
      expect.objectContaining({ actorId: lead.id, target: id }),
    ]);

    const placed = await call(
      "place_lounge_offer",
      { offerId: id, day: 2, startMinute: 18 * 60 },
      lead.id,
    );
    expect(placed.error).toBeUndefined();
    expect(await auditRows("lounge.offer_placed")).toHaveLength(1);

    const programme = (await call("get_lounge", {}, host.id)).data!
      .programme as { offerId: string; day: number; start: string }[];
    expect(programme).toEqual([
      expect.objectContaining({
        offerId: id,
        day: 2,
        start: "18:00",
        end: "19:30",
        host: host.displayName,
      }),
    ]);
  });

  it("writes the music note as a compare-and-set on its version", async () => {
    await campYear();
    const lead = await leadOf("ministry_of_vibes");
    const first = await call(
      "set_lounge_music_note",
      { musicPolicy: "No trance before midnight", expectedVersion: 0 },
      lead.id,
    );
    expect(first.data).toMatchObject({ version: 1 });
    const again = await call(
      "set_lounge_music_note",
      { musicPolicy: "Anything goes", expectedVersion: 0 },
      lead.id,
    );
    expect(again.error).toBe(SETTINGS_CHANGED);
    const read = await call("get_lounge", {}, lead.id);
    expect(read.data!.musicNote).toEqual({
      text: "No trance before midnight",
      version: 1,
    });
    expect(await auditRows("lounge.music_policy_changed")).toHaveLength(1);
  });
});
