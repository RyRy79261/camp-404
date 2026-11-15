// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { LEAD_PLACES_BELOW, ROLE_CHANGED, ROLE_FULL } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import { NO_ROLES_LAST_YEAR } from "@camp404/db/team-roles";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { HELP_WANTED_REFUSAL } from "../../help-wanted-copy";
import { registerHelpWantedTools } from "../tools/help-wanted";

// Help wanted's connector tools, on real Postgres (PGlite) through the real
// handlers: the page's own writes for the same person, who may and who is
// refused in what words, the rows and audit rows they leave, the
// compare-and-set on the version read, and the board cut on the server (who
// is keen reaches only a captain or that team's leads).

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerHelpWantedTools({
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
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

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

type RoleOut = {
  roleId: string | null;
  name: string;
  places: number;
  note: string | null;
  version: number;
  people: unknown[];
  youAreKeen: boolean;
  keen?: { userId: string; name: string }[];
};

async function kitchenRoles(as: string): Promise<RoleOut[]> {
  const { data } = await call("get_help_wanted", { team: "kitchen" }, as);
  const [team] = data!.teams as { roles: RoleOut[] }[];
  return team!.roles;
}

async function addShopper(lead: string) {
  const added = await call(
    "add_team_role",
    { team: "kitchen", name: "Shopper", places: 1, note: "Town runs" },
    lead,
  );
  expect(added.error).toBeUndefined();
  return added.data!.roleId as string;
}

describe("running a team's roles", () => {
  it("lets a lead of that team add and change a role, and refuses everyone else", async () => {
    await campYear();
    const kitchenLead = await leadOf("kitchen");
    const otherLead = await leadOf("structures");
    const plain = await member();

    expect(
      (
        await call(
          "add_team_role",
          { team: "kitchen", name: "Shopper", places: 1 },
          otherLead.id,
        )
      ).error,
    ).toContain(HELP_WANTED_REFUSAL);
    expect(
      (
        await call(
          "add_team_role",
          { team: "kitchen", name: "Shopper", places: 1 },
          plain.id,
        )
      ).error,
    ).toContain(HELP_WANTED_REFUSAL);

    const roleId = await addShopper(kitchenLead.id);
    expect(await auditRows("team.role_added")).toHaveLength(1);

    const changed = await call(
      "update_team_role",
      { team: "kitchen", roleId, expectedVersion: 1, places: 2 },
      kitchenLead.id,
    );
    expect(changed.error).toBeUndefined();
    const [row] = await h
      .db()
      .select()
      .from(schema.teamRoles)
      .where(eq(schema.teamRoles.id, roleId));
    expect(row).toMatchObject({
      name: "Shopper",
      note: "Town runs",
      places: 2,
      version: 2,
    });
    expect(await auditRows("team.role_changed")).toHaveLength(1);

    const stale = await call(
      "update_team_role",
      { team: "kitchen", roleId, expectedVersion: 1, name: "Buyer" },
      kitchenLead.id,
    );
    expect(stale.error).toBe(ROLE_CHANGED);
    expect(
      (
        await call(
          "update_team_role",
          { team: "kitchen", roleId, expectedVersion: 2, name: "Buyer" },
          otherLead.id,
        )
      ).error,
    ).toContain(HELP_WANTED_REFUSAL);
  });

  it("sets lead places, refusing fewer than lead now, and says when there is nothing to copy", async () => {
    await campYear();
    const kitchenLead = await leadOf("kitchen");
    await leadOf("kitchen");
    expect(
      (
        await call(
          "set_lead_places",
          { team: "kitchen", places: 1 },
          kitchenLead.id,
        )
      ).error,
    ).toBe(LEAD_PLACES_BELOW);
    expect(
      (
        await call(
          "set_lead_places",
          { team: "kitchen", places: 3 },
          kitchenLead.id,
        )
      ).error,
    ).toBeUndefined();
    expect(await auditRows("team.lead_places_set")).toHaveLength(1);
    expect(
      (await call("copy_last_years_roles", { team: "kitchen" }, kitchenLead.id))
        .error,
    ).toBe(NO_ROLES_LAST_YEAR);
  });
});

describe("keen, giving and taking", () => {
  it("shows who is keen only to the team's leads, and gives the role once", async () => {
    await campYear();
    const kitchenLead = await leadOf("kitchen");
    const keen = await member();
    const other = await member();
    const roleId = await addShopper(kitchenLead.id);

    expect(
      (
        await call(
          "set_my_keen",
          { team: "kitchen", roleId, keen: true },
          keen.id,
        )
      ).error,
    ).toBeUndefined();

    const seenByOther = (await kitchenRoles(other.id)).find(
      (r) => r.roleId === roleId,
    )!;
    expect(seenByOther.keen).toBeUndefined();
    expect(seenByOther.youAreKeen).toBe(false);
    expect(
      (await kitchenRoles(keen.id)).find((r) => r.roleId === roleId)!
        .youAreKeen,
    ).toBe(true);
    expect(
      (await kitchenRoles(kitchenLead.id)).find((r) => r.roleId === roleId)!
        .keen,
    ).toEqual([{ userId: keen.id, name: keen.displayName }]);

    const given = await call(
      "give_team_role",
      { team: "kitchen", roleId, userId: keen.id },
      kitchenLead.id,
    );
    expect(given.data).toMatchObject({ given: true, joinedTeam: true });
    expect(await auditRows("team.role_given")).toHaveLength(1);
    expect(
      (
        await call(
          "give_team_role",
          { team: "kitchen", roleId, userId: other.id },
          kitchenLead.id,
        )
      ).error,
    ).toBe(ROLE_FULL);

    expect(
      (
        await call(
          "take_team_role",
          { team: "kitchen", roleId, userId: keen.id },
          kitchenLead.id,
        )
      ).error,
    ).toBeUndefined();
    const holders = await h
      .db()
      .select()
      .from(schema.teamRoleHolders)
      .where(eq(schema.teamRoleHolders.roleId, roleId));
    expect(holders).toHaveLength(0);
    expect(await auditRows("team.role_taken")).toHaveLength(1);
  });

  it("keeps the Lead role a captain's to give", async () => {
    await campYear();
    const kitchenLead = await leadOf("kitchen");
    const boss = await captain();
    const next = await member();
    const lead = { team: "kitchen", roleId: null, userId: next.id };

    expect(
      (await call("give_team_role", lead, kitchenLead.id)).error,
    ).toContain(HELP_WANTED_REFUSAL);
    // Two leads wanted, so the second place is open.
    await call("set_lead_places", { team: "kitchen", places: 2 }, boss.id);
    expect((await call("give_team_role", lead, boss.id)).error).toBeUndefined();
    const [row] = await h
      .db()
      .select()
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.userId, next.id),
          eq(schema.teamMemberships.team, "kitchen"),
        ),
      );
    expect(row!.isLead).toBe(true);
  });
});
