import { describe, expect, it } from "vitest";
import { MONEY_KEEPER, type Rule } from "@camp404/core";
import { lockActor, lockAllowed } from "../actor";
import { lockSenderReach } from "../broadcasts";
import { withTransaction } from "../index";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// The one read of who is acting, on a real Postgres (PGlite). The camp's year
// is the default (1) here, so a lead row of another year must not count.

// Each read runs as a write's would: inside its own transaction.
const actorOf = (id: string) => withTransaction((tx) => lockActor(tx, id));
const allowed = (id: string, rule: Rule) =>
  withTransaction((tx) => lockAllowed(tx, id, rule));
const reachOf = (id: string) =>
  withTransaction((tx) => lockSenderReach(tx, id));

describe("lockActor", () => {
  const h = useTestDb();

  it("reads a captain, a lead of this year's teams, and a member", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "finance",
      isLead: true,
    });
    await makeMembership(db, { userId: lead.id, team: "kitchen" });
    const member = await makeUser(db);
    await makeMembership(db, { userId: member.id, team: "kitchen" });

    expect(await actorOf(captain.id)).toEqual({
      rank: "captain",
      ledTeams: [],
    });
    expect(await actorOf(lead.id)).toEqual({
      rank: "team_lead",
      ledTeams: ["finance"],
    });
    expect(await actorOf(member.id)).toEqual({
      rank: "camp_member",
      ledTeams: [],
    });
  });

  it("does not count a lead row of another year", async () => {
    const db = h.db();
    const old = await makeUser(db);
    await makeMembership(db, {
      userId: old.id,
      team: "finance",
      isLead: true,
      cycle: 2020,
    });
    expect(await actorOf(old.id)).toEqual({
      rank: "camp_member",
      ledTeams: [],
    });
    expect(await allowed(old.id, MONEY_KEEPER)).toBe(false);
  });

  it("refuses an id that is not a UUID, and reads nobody unknown as a member", async () => {
    expect(await actorOf("not-a-uuid")).toBeNull();
    expect(await allowed("not-a-uuid", MONEY_KEEPER)).toBe(false);
    expect(await actorOf("00000000-0000-4000-8000-000000000000")).toEqual({
      rank: "camp_member",
      ledTeams: [],
    });
  });

  it("lets a rule decide on what it read", async () => {
    const db = h.db();
    const finance = await makeUser(db);
    await makeMembership(db, {
      userId: finance.id,
      team: "finance",
      isLead: true,
    });
    const kitchen = await makeUser(db);
    await makeMembership(db, {
      userId: kitchen.id,
      team: "kitchen",
      isLead: true,
    });
    expect(await allowed(finance.id, MONEY_KEEPER)).toBe(true);
    expect(await allowed(kitchen.id, MONEY_KEEPER)).toBe(false);
  });

  it("keeps lockSenderReach's answer: undefined for a captain, else the led teams", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await makeUser(db);
    expect(await reachOf(captain.id)).toBeUndefined();
    expect(await reachOf(lead.id)).toEqual(["kitchen"]);
    expect(await reachOf(member.id)).toEqual([]);
  });
});
