import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { canEditTeamProgram } from "@camp404/core";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import { listBudgetTotals } from "@camp404/db/team-budgets";
import { TEAM_PROGRAM_CHANGED } from "@camp404/db/team-programs";
import {
  TEAM_DESCRIPTION_MAX,
  TeamProgramInput,
  type Team,
} from "@camp404/types";
import { getTeamsConfig, teamLabelMap } from "../../camp-config";
import {
  CHECK_TEAM_PROGRAM,
  TEAM_PROGRAM_REFUSAL,
  teamProgramPath,
} from "../../team-program-copy";
import { getTeamProgram, saveTeamProgram } from "../../team-programs";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { deny, runTool, ToolError } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);

// Team budgets (#242): one amount per team per year, in rands. Every member
// reads each team's totals (budget, spent, left). Setting a budget moves money,
// so it is website-only (owner, 2026-10-04): captains and Finance leads set it
// on the Budgets page. Amounts come back in whole cents.
//
// A team's description (its program's "About", owner's ruling 4,
// 2026-09-27), so a captain can fill every team's in from a chat (the Notion
// import, #239). Every member reads it, as on the team's page. Changing it is
// the page's Save (saveTeamProgramAction): the same Zod shape
// (TeamProgramInput: at most TEAM_DESCRIPTION_MAX characters, plain text, no
// links), the same rule (canEditTeamProgram: a captain, or a lead OF THAT
// TEAM this year), checked here for the sentence and again by
// saveTeamProgram inside its own transaction, which re-reads the actor, is a
// compare-and-set on the version the person read, and writes the same
// audit_log row (team.program_changed). The connector's own log records only
// that a description was given, never its words.

function presentProgram(
  program: { description: string; version: number; updatedAt: Date | null },
  team: Team,
  label: string,
  scope: McpScope,
) {
  return {
    team,
    teamLabel: label,
    description: program.description,
    version: program.version,
    updatedAt: program.updatedAt,
    canEdit: canEditTeamProgram(scope.viewerRank, scope.leadTeams, team),
    url: siteUrl(teamProgramPath(team)),
  };
}

async function labelOf(team: Team): Promise<string> {
  return teamLabelMap(await getTeamsConfig())[team] ?? team;
}

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    "get_team_budget",
    {
      title: "Get a team's budget",
      description:
        "Returns this year's totals for one team, in whole rand cents: its budget (null when none is set), what it has spent (the claims its team said yes to), what is waiting for a yes, and what is left. Readable by any member.",
      inputSchema: z.object({ team: TeamEnum }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_team_budget",
        extra,
        argsForAudit: args,
        handler: async () => {
          const totals = await listBudgetTotals(await currentCycleNumber());
          return { team: args.team, ...totals[args.team] };
        },
      }),
  );

  server.registerTool(
    "list_team_budgets",
    {
      title: "List every team's budget",
      description:
        "Returns this year's totals for every team, in whole rand cents: budget, spent, waiting and left. Readable by any member.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_team_budgets",
        extra,
        argsForAudit: null,
        handler: async () => {
          const totals = await listBudgetTotals(await currentCycleNumber());
          return Object.entries(totals).map(([team, t]) => ({ team, ...t }));
        },
      }),
  );
  server.registerTool(
    "get_team_description",
    {
      title: "Read a team's description",
      description:
        "Returns what a team's program says about the team (its description, empty when none is written), as the team's page shows it. `version` is what update_team_description needs (0 when nothing has been saved yet); `canEdit` says whether you may change it (captains, and that team's leads this year).",
      inputSchema: z.object({ team: TeamEnum }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_team_description",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const [program, label] = await Promise.all([
            getTeamProgram(args.team),
            labelOf(args.team),
          ]);
          return presentProgram(program, args.team, label, scope);
        },
      }),
  );

  server.registerTool(
    "update_team_description",
    {
      title: "Change a team's description",
      description: `Replaces what a team's program says about the team, as the Save on the team's page does: plain text, at most ${TEAM_DESCRIPTION_MAX} characters (an empty one clears it). Give \`expectedVersion\`: the \`version\` from get_team_description. If someone saved since, nothing changes and you are told to read it again.`,
      inputSchema: z.object({
        team: TeamEnum,
        // Its length is checked below by the page's own shape, so a long one
        // is refused in the page's words.
        description: z.string(),
        expectedVersion: z.number().int().min(0),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_team_description",
        extra,
        // Free text stays out of the connector's log: only that it was given.
        argsForAudit: {
          team: args.team,
          expectedVersion: args.expectedVersion,
          fields: ["description"],
        },
        handler: async ({ scope }) => {
          if (
            !canEditTeamProgram(scope.viewerRank, scope.leadTeams, args.team)
          ) {
            deny(
              `${TEAM_PROGRAM_REFUSAL} On the website: ${siteUrl(teamProgramPath(args.team))}`,
            );
          }
          const parsed = TeamProgramInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? CHECK_TEAM_PROGRAM,
            );
          }
          const result = await saveTeamProgram({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) {
            throw new ToolError(
              result.error === TEAM_PROGRAM_CHANGED
                ? "Someone changed this team's description first. Read it again with get_team_description, show the person, then retry."
                : result.error,
            );
          }
          // The version THIS save made, never a re-read's (a save in between
          // must not hand a later voice row its version).
          return presentProgram(
            {
              description: parsed.data.description,
              version: result.version,
              updatedAt: new Date(),
            },
            args.team,
            await labelOf(args.team),
            scope,
          );
        },
      }),
  );
}
