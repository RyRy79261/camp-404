import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { JOIN_SECTION_KEYS, type JoinSectionKey } from "@camp404/types";
import {
  describeTeam,
  getJoinEditorData,
  JoinSectionInvalidError,
  saveJoinSections,
} from "../../join-site";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// join.camp-404.com's words over MCP, through the Join site editor's own
// functions (lib/join-site.ts, a twin() facade over @camp404/db/join-site).
// Captains only, as saveJoinPageAction (captainActionGate("captain")).
//
// THE PUBLIC SITE READS THESE AT ONCE: join.camp-404.com re-reads them every
// minute (apps/join, revalidate 60), so a save here is public within a
// minute, exactly as the editor's Save is. The owner asked for the copy to be
// editable from a chat; the tool descriptions say it is live.
//
//  - A section is saved whole, as the editor sends it, checked by the
//    section's own schema (parseJoinSections, inside saveJoinSiteSections) and
//    audited join_site.section_saved in the same transaction; the year is the
//    camp's, read on the server, never passed in. The page keeps no version,
//    so get_join_page gives each section a `version` (a hash of its words)
//    and the save refuses when the section no longer matches what the caller
//    read. That check runs just before the write, not under its lock: two
//    saves of the same section in the same instant can still both land, as
//    on the editor.
//  - What a team does is describeTeam (camp.teams.described, audited), the
//    editor's team lines: a team the camp has switched on, at most 200
//    characters, blank back to the default; it takes the line the caller
//    read (`expected`).
//  - The `about` section (About Camp 404, @camp404/types join-about.ts) is
//    also the app's About page. Its Markdown carries three marks the
//    description names, so a chat edit keeps the highlights.
//  - Not here: the fee scale (the `fee` section: the camp fee's amounts, so
//    money) and the Burn's dates (the camp's year settings). Both stay on
//    the website.

const PAGE = "/captains/join-site";
const TEAM_LINE_MAX = 200;

const EDITABLE = JOIN_SECTION_KEYS.filter((k) => k !== "fee") as [
  JoinSectionKey,
  ...JoinSectionKey[],
];

/** The same JSON whatever order its keys were stored in. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** A section's version: a short hash of its words as stored. */
export function sectionVersion(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex")
    .slice(0, 16);
}

export const SECTION_CHANGED =
  "Someone changed this section since you read it. Read it again with get_join_page, show the person, then retry.";
export const FEE_ONLY =
  "The fee scale is the camp fee's money, so a captain changes it on the website.";
export const TEAM_LINE_CHANGED =
  "Someone changed this team's line since you read it. Read it again with get_join_page, show the person, then retry.";

export function registerJoinSiteTools(server: McpServer): void {
  server.registerTool(
    "get_join_page",
    {
      title: "Read the join site's words",
      description:
        "The words of join.camp-404.com, the camp's public recruiting page, as the Join site editor shows them: each section's content with its `version` (what update_join_page_section takes), and each team's line (`line`, \"\" when it shows the default). `fee` is read-only here.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_join_page",
        extra,
        argsForAudit: null,
        handler: async () => {
          const data = await getJoinEditorData();
          return {
            year: data.yearIsSet ? data.year : null,
            yearName: data.yearName,
            burn: data.burn,
            sections: Object.fromEntries(
              JOIN_SECTION_KEYS.map((key) => [
                key,
                {
                  content: data.content[key],
                  version: sectionVersion(data.content[key]),
                  editableHere: key !== "fee",
                },
              ]),
            ),
            teams: data.teams.map((t) => ({
              team: t.key,
              label: t.label,
              line: t.description,
              defaultLine: t.defaultDescription,
            })),
            publicUrl: "https://join.camp-404.com",
            url: siteUrl(PAGE),
          };
        },
      }),
  );

  server.registerTool(
    "update_join_page_section",
    {
      title: "Change a section of the join site",
      description:
        "Replaces one section of join.camp-404.com with `content`, the whole section in get_join_page's shape, and `expectedVersion`, its version there. LIVE ON THE PUBLIC SITE AT ONCE: show the person the new words first. Refused if it changed since. The fee section stays on the website. `about` is About Camp 404 (the camp's intro, word for word as the captains keep it): `intro` and `sections` (theme_camp, contributions, where, crew, responsibilities, perks, transport), each Markdown; it is also the About page every member reads in the app. Keep its marks as written: ==highlighted==, {{accent colour}}, ++underlined++.",
      inputSchema: z.object({
        section: z.enum(EDITABLE),
        content: z.record(z.string(), z.unknown()),
        expectedVersion: z.string().min(1).max(64),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_join_page_section",
        extra,
        // The words stay out of the connector's log: the audit row names the
        // section.
        argsForAudit: {
          section: args.section,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          // Checked here too, not only by the input schema.
          if (!EDITABLE.includes(args.section)) throw new ToolError(FEE_ONLY);
          const data = await getJoinEditorData();
          if (
            sectionVersion(data.content[args.section]) !== args.expectedVersion
          ) {
            throw new ToolError(SECTION_CHANGED);
          }
          try {
            await saveJoinSections({
              year: data.year,
              sections: { [args.section]: args.content },
              actorUserId: scope.campUserId,
            });
          } catch (error) {
            if (error instanceof JoinSectionInvalidError) {
              throw new ToolError(
                `${args.section}: ${error.issues[0] ?? "Check this section."}`,
              );
            }
            throw error;
          }
          const saved = (await getJoinEditorData()).content[args.section];
          return {
            section: args.section,
            content: saved,
            version: sectionVersion(saved),
            live: "join.camp-404.com shows it within a minute.",
            url: siteUrl(PAGE),
          };
        },
      }),
  );

  server.registerTool(
    "update_join_team_line",
    {
      title: "Change a team's line on the join site",
      description: `Changes what join.camp-404.com says a team does (at most ${TEAM_LINE_MAX} characters; "" goes back to the default). Give \`expected\`, the team's \`line\` from get_join_page. LIVE ON THE PUBLIC SITE AT ONCE.`,
      inputSchema: z.object({
        team: z.string().min(1).max(60),
        line: z.string(),
        expected: z.string(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_join_team_line",
        extra,
        argsForAudit: { team: args.team, fields: ["line"] },
        handler: async ({ scope }) => {
          const data = await getJoinEditorData();
          const team = data.teams.find((t) => t.key === args.team);
          if (!team) throw new ToolError("Unknown team.");
          if (args.line.trim().length > TEAM_LINE_MAX) {
            throw new ToolError(
              `${team.label}: keep it under ${TEAM_LINE_MAX} characters.`,
            );
          }
          if (team.description.trim() !== args.expected.trim()) {
            throw new ToolError(TEAM_LINE_CHANGED);
          }
          await describeTeam({
            key: args.team,
            description: args.line,
            actorUserId: scope.campUserId,
          });
          return {
            team: args.team,
            label: team.label,
            line: args.line.trim(),
            showing: args.line.trim() || team.defaultDescription,
            live: "join.camp-404.com shows it within a minute.",
            url: siteUrl(PAGE),
          };
        },
      }),
  );
}
