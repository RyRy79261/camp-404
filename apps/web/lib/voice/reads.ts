import { getTeamsConfig, teamLabelMap } from "../camp-config";
import {
  listDisplayNames,
  listNameableMembers,
  listTeamPeople,
  type NamedMember,
  type TeamPerson,
} from "../roster";

// The few reads voice makes of its own, outside the connector's tools: the
// roster's names (to match a spoken name and to write a sentence with a full
// display name), a team's people, and the teams' labels. Each goes through
// the roster facade (lib/roster.ts), whose twin() picks the test store under
// E2E, so Playwright drives the same code.

export type RosterPerson = NamedMember;

/** Every member a captain may name: approved or waiting, never a stub. */
export async function readRoster(): Promise<RosterPerson[]> {
  return listNameableMembers();
}

/** Display names by id, for the ids given. */
export async function readNames(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) return new Map();
  const rows = await listDisplayNames(wanted);
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** A team's people this year, leads first. */
export async function readTeamPeople(team: string): Promise<TeamPerson[]> {
  return listTeamPeople(team as never);
}

/** The teams' labels by key. */
export async function readTeamLabels(): Promise<Record<string, string>> {
  return teamLabelMap(await getTeamsConfig());
}
