import { and, eq, inArray, ne } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { listTeamPeople, type TeamPerson } from "@camp404/db/team-memberships";
import { getTeamsConfig, teamLabelMap } from "../camp-config";
import { usesTestStore } from "../test-mode";
import { testStore } from "../test-store";

// The few reads voice makes of its own, outside the connector's tools: the
// roster's names (to match a spoken name and to write a sentence with a full
// display name), a team's people, and the teams' labels. Each has its
// test-store twin, so Playwright drives the same code.

export interface RosterPerson {
  id: string;
  name: string;
}

/** Every member a captain may name: approved or waiting, never a stub. */
export async function readRoster(): Promise<RosterPerson[]> {
  if (usesTestStore()) {
    return testStore
      .allUsers()
      .filter((u) => u.approvalStatus !== "rejected")
      .map((u) => ({ id: u.id, name: u.displayName ?? "Unnamed member" }));
  }
  const rows = await createHttpDb()
    .select({ id: schema.users.id, name: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        ne(schema.users.approvalStatus, "rejected"),
      ),
    );
  return rows.map((r) => ({ id: r.id, name: r.name ?? "Unnamed member" }));
}

/** Display names by id, for the ids given. */
export async function readNames(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) return new Map();
  if (usesTestStore()) {
    return new Map(
      wanted.flatMap((id) => {
        const u = testStore.findUserById(id);
        return u ? [[id, u.displayName ?? "Unnamed member"] as const] : [];
      }),
    );
  }
  const rows = await createHttpDb()
    .select({ id: schema.users.id, name: schema.users.displayName })
    .from(schema.users)
    .where(inArray(schema.users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name ?? "Unnamed member"]));
}

/** A team's people this year, leads first. */
export async function readTeamPeople(team: string): Promise<TeamPerson[]> {
  if (usesTestStore()) {
    return testStore.listTeamPeople(team as never);
  }
  return listTeamPeople(team as never);
}

/** The teams' labels by key. */
export async function readTeamLabels(): Promise<Record<string, string>> {
  return teamLabelMap(await getTeamsConfig());
}
