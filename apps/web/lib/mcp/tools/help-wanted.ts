import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  canPickTeamLead,
  ROLE_CHANGED,
  ROLE_GONE,
  roleKeeper,
} from "@camp404/core";
import {
  CopyTeamRolesInput,
  SaveTeamRoleInput,
  SetLeadPlacesInput,
  TeamRoleKeenInput,
  TeamRoleMemberInput,
} from "@camp404/types";
import {
  copyLastYearsRoles,
  getHelpWantedView,
  giveTeamRole,
  saveTeamRole,
  setKeen,
  setLeadPlaces,
  takeTeamRole,
  type HelpWantedView,
} from "../../help-wanted";
import {
  CHECK_ROLE,
  HELP_WANTED_PATH,
  HELP_WANTED_REFUSAL,
  RELOAD,
} from "../../help-wanted-copy";
import { siteUrl } from "../capabilities";
import { scopeActor, type McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// Help wanted (owner's pick A, 2026-10-09) over MCP, through the page's own
// facade (lib/help-wanted.ts → @camp404/db/team-roles, or the E2E store).
//
//  - get_help_wanted is getHelpWantedView for this person, cut on the server
//    as the page is: who is keen on a role, and people's ids, reach only a
//    captain or that team's leads; everyone else gets names and their own
//    keen flags.
//  - "I'm keen" is the caller's own: their id, never one passed in.
//  - Running a team's roles: the gate lets team leads in (the actions'
//    team_lead rung), the tool asks roleKeeper on the team (a lead of THAT
//    team, or a captain) and canPickTeamLead for the Lead role, as the
//    actions do, and the write asks again on the actor it locks. The writes
//    keep their audit rows (team.role_*, team.lead_places_set,
//    team.roles_copied). update_team_role takes only what changes and fills
//    the rest from the role AT the version the caller read.
//  - The page also refreshes the acting member's desktop after a give or a
//    take (revalidateManifest); a chat has no desktop to refresh, and their
//    next page load reads the new manifest. Removing a role, and Ol' Jeb's
//    "tell the camp" post after a new lead, stay on the page.

/** The board as this person may see it. */
export function boardFor(scope: McpScope): Promise<HelpWantedView> {
  const actor = scopeActor(scope);
  return getHelpWantedView({
    userId: scope.campUserId,
    rank: scope.viewerRank,
    ledTeams: actor.ledTeams,
  });
}

/** The action's screen check: may this person run `team`'s roles? */
function assertKeeper(scope: McpScope, team: string): void {
  if (!roleKeeper(team).allows(scopeActor(scope))) {
    throw new ToolError(
      `${HELP_WANTED_REFUSAL} On the website: ${siteUrl(HELP_WANTED_PATH)}`,
    );
  }
}

/** Give or take: Lead is a captain's, any other role the team's keepers'. */
function assertMayGive(
  scope: McpScope,
  team: string,
  roleId: string | null,
): void {
  if (roleId === null) {
    if (!canPickTeamLead(scope.viewerRank)) {
      throw new ToolError(
        `${HELP_WANTED_REFUSAL} On the website: ${siteUrl(HELP_WANTED_PATH)}`,
      );
    }
    return;
  }
  assertKeeper(scope, team);
}

function parsed<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
  fallback: string,
): T {
  if (!result.success) {
    throw new ToolError(result.error.issues[0]?.message ?? fallback);
  }
  return result.data;
}

const Team = z.string().min(1).max(60).describe("A team key, e.g. kitchen.");
const RoleRef = z
  .string()
  .uuid()
  .nullable()
  .describe("The role's id from get_help_wanted, or null for the team's Lead.");

export function registerHelpWantedTools(server: McpServer): void {
  server.registerTool(
    "get_help_wanted",
    {
      title: "Read Help wanted",
      description:
        "Every active team's roles this year, as Help wanted shows you: each role's `roleId` (null for Lead), name, note, places, how many fill it, who, its `version`, and whether you are keen. A captain or that team's lead also gets people's ids, who is keen, and `people` (everyone a role may go to). Narrow with `team`.",
      inputSchema: z.object({ team: Team.optional() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_help_wanted",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const view = await boardFor(scope);
          return {
            year: view.year,
            keenCount: view.keenCount,
            youPickLeads: view.picksLead,
            teams: view.teams
              .filter((t) => !args.team || t.key === args.team)
              .map((t) => ({
                team: t.key,
                label: t.label,
                yourTeam: t.mine,
                youRunItsRoles: t.manages,
                roles: t.rows.map((r) => ({
                  roleId: r.roleId,
                  name: r.name,
                  note: r.note,
                  places: r.places,
                  filled: r.filled,
                  open: r.open,
                  version: r.version,
                  people: r.people.map((p) =>
                    p.userId ? { userId: p.userId, name: p.name } : p.name,
                  ),
                  youHoldIt: r.people.some((p) => p.you),
                  youAreKeen:
                    r.action === "unkeen" ||
                    (r.keen ?? []).some((k) => k.userId === scope.campUserId),
                  ...(r.keen ? { keen: r.keen } : {}),
                })),
                ...(t.lastYear.length > 0
                  ? { lastYearsRoles: t.lastYear }
                  : {}),
              })),
            ...(view.everyone
              ? {
                  people: view.everyone.map((p) => ({
                    userId: p.userId,
                    name: p.name,
                    teams: p.teams,
                  })),
                }
              : {}),
            url: siteUrl(HELP_WANTED_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_my_keen",
    {
      title: "Say I'm keen on a role",
      description:
        "Says you're keen on a team's role (`keen: true`), or takes that back (`false`), as Help wanted's “I'm keen” and Undo do. The team's lead or a captain picks. `roleId` null is the team's Lead. Refused when the role is full or yours already.",
      inputSchema: z.object({ team: Team, roleId: RoleRef, keen: z.boolean() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_keen",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(TeamRoleKeenInput.safeParse(args), RELOAD);
          const result = await setKeen(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          return { team: input.team, roleId: input.roleId, keen: input.keen };
        },
      }),
  );

  server.registerTool(
    "add_team_role",
    {
      title: "Add a team role",
      description:
        "Adds a role to a team this year, as Help wanted's Add role does: a captain for any team, a team lead for a team they lead. `places` is 1 to 20; `note` is one line. Lead is every team's already. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        team: Team,
        name: z.string().min(1).max(60),
        places: z.number().int().min(1).max(20),
        note: z.string().max(120).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_team_role",
        extra,
        argsForAudit: { team: args.team, name: args.name },
        handler: async ({ scope }) => {
          const input = parsed(
            SaveTeamRoleInput.safeParse({
              ...args,
              id: null,
              expectedVersion: 0,
            }),
            CHECK_ROLE,
          );
          assertKeeper(scope, input.team);
          const result = await saveTeamRole(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          // The new role's id, from the board as it now stands.
          const view = await boardFor(scope);
          const made = view.teams
            .find((t) => t.key === input.team)
            ?.rows.filter((r) => r.roleId && r.name === input.name)
            .at(-1);
          return {
            roleId: made?.roleId ?? null,
            team: input.team,
            name: input.name,
            places: input.places,
            version: made?.version ?? 1,
            url: siteUrl(HELP_WANTED_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "update_team_role",
    {
      title: "Change a team role",
      description:
        "Changes a role's name, places or note, as the role's pencil does: a captain, or a lead of its team. Give its `team`, `roleId`, the `expectedVersion` you read (get_help_wanted) and only what changes; null clears the note. Refused if it changed since you read it, or fewer places than people fill it. Recorded in the camp's history.",
      inputSchema: z.object({
        team: Team,
        roleId: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        name: z.string().min(1).max(60).optional(),
        places: z.number().int().min(1).max(20).optional(),
        note: z.string().max(120).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_team_role",
        extra,
        argsForAudit: {
          team: args.team,
          roleId: args.roleId,
          expectedVersion: args.expectedVersion,
          fields: (["name", "places", "note"] as const).filter(
            (k) => args[k] !== undefined,
          ),
        },
        handler: async ({ scope }) => {
          assertKeeper(scope, args.team);
          const view = await boardFor(scope);
          const current = view.teams
            .find((t) => t.key === args.team)
            ?.rows.find((r) => r.roleId === args.roleId);
          if (!current) throw new ToolError(ROLE_GONE);
          // The fields left out are filled from this read, so it must be the
          // version the caller read; the write checks the version again.
          if (current.version !== args.expectedVersion) {
            throw new ToolError(ROLE_CHANGED);
          }
          const input = parsed(
            SaveTeamRoleInput.safeParse({
              id: args.roleId,
              team: args.team,
              name: args.name ?? current.name,
              places: args.places ?? current.places,
              note: args.note !== undefined ? args.note : current.note,
              expectedVersion: args.expectedVersion,
            }),
            CHECK_ROLE,
          );
          const result = await saveTeamRole(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          return {
            roleId: args.roleId,
            team: input.team,
            name: input.name,
            places: input.places,
            note: input.note,
            version: args.expectedVersion + 1,
          };
        },
      }),
  );

  server.registerTool(
    "set_lead_places",
    {
      title: "Set how many leads a team wants",
      description:
        "Says how many leads a team wants this year (1 to 20), as the Lead row's pencil does: a captain, or a lead of that team. Refused below the number who lead it now. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        team: Team,
        places: z.number().int().min(1).max(20),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_lead_places",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(SetLeadPlacesInput.safeParse(args), CHECK_ROLE);
          assertKeeper(scope, input.team);
          const result = await setLeadPlaces(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          return { team: input.team, leadPlaces: input.places };
        },
      }),
  );

  server.registerTool(
    "copy_last_years_roles",
    {
      title: "Copy last year's roles",
      description:
        "Brings back a team's roles from the last year it had any, with nobody in them, as “Copy last year's roles” does: a captain, or a lead of that team. Only while the team has no roles this year. Recorded in the camp's history under your name.",
      inputSchema: z.object({ team: Team }),
    },
    async (args, extra) =>
      runTool({
        toolName: "copy_last_years_roles",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(CopyTeamRolesInput.safeParse(args), RELOAD);
          assertKeeper(scope, input.team);
          const result = await copyLastYearsRoles(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          return { team: input.team, copied: result.copied };
        },
      }),
  );

  server.registerTool(
    "give_team_role",
    {
      title: "Give someone a team role",
      description:
        "Gives a team's role to a member, as Help wanted's Pick someone does: a captain, or a lead of that team; the Lead role (`roleId` null) only a captain. It puts them on the team if they aren't. Refused when the role is full or theirs already. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        team: Team,
        roleId: RoleRef,
        userId: z.string().uuid(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "give_team_role",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(TeamRoleMemberInput.safeParse(args), RELOAD);
          assertMayGive(scope, input.team, input.roleId);
          const result = await giveTeamRole(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          return {
            team: input.team,
            roleId: input.roleId,
            userId: input.userId,
            given: true,
            joinedTeam: result.joinedTeam,
          };
        },
      }),
  );

  server.registerTool(
    "take_team_role",
    {
      title: "Take a team role back",
      description:
        "Takes a team's role back from someone, as the role's take-off does: a captain, or a lead of that team; the Lead role (`roleId` null) only a captain. They stay on the team. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        team: Team,
        roleId: RoleRef,
        userId: z.string().uuid(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "take_team_role",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(TeamRoleMemberInput.safeParse(args), RELOAD);
          assertMayGive(scope, input.team, input.roleId);
          const result = await takeTeamRole(scope.campUserId, input);
          if (!result.ok) throw new ToolError(result.error);
          return {
            team: input.team,
            roleId: input.roleId,
            userId: input.userId,
            given: false,
          };
        },
      }),
  );
}
