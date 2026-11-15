import { getJoinEditorData } from "../join-site";
import { sectionVersion } from "../mcp/tools/join-site";
import { blocked, quote, shown, str, type PreviewFn } from "./preview-kit";

// join.camp-404.com's words (tools/join-site.ts). Every row says the words go
// on the PUBLIC site, shows the new words, and runs on the version read now.

const PAGE = "/captains/join-site";
const PUBLIC = "LIVE on the public join.camp-404.com within a minute";

export const JOIN_SITE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async update_join_page_section(args) {
    const section = str(args.section);
    const data = await getJoinEditorData();
    if (!(section in data.content) || section === "fee") {
      return blocked(
        "Change the join site",
        "That section can't be changed here.",
        args,
        PAGE,
      );
    }
    const now = data.content[section as keyof typeof data.content];
    const content =
      args.content && typeof args.content === "object"
        ? (args.content as Record<string, unknown>)
        : {};
    return {
      sentence: `Replace the join site's ${quote(section)} section`,
      facts: `Join site · ${PUBLIC}`,
      change: Object.entries(content).map(([k, v]) => `${k}: ${shown(v)}`),
      path: PAGE,
      args: { ...args, expectedVersion: sectionVersion(now) },
      keys: [`join-site:${section}`],
    };
  },

  async update_join_team_line(args) {
    const data = await getJoinEditorData();
    const team = data.teams.find((t) => t.key === str(args.team));
    if (!team) {
      return blocked(
        "Change a team's line on the join site",
        "Unknown team.",
        args,
        PAGE,
      );
    }
    const line = str(args.line).trim();
    return {
      sentence: `Change what the join site says ${team.label} does`,
      facts: `Join site · ${PUBLIC} · now ${shown(team.description || team.defaultDescription)}`,
      change: [
        `Line: ${line ? shown(line) : `back to the default, ${shown(team.defaultDescription)}`}`,
      ],
      path: PAGE,
      args: { ...args, expected: team.description },
      keys: [`join-site:team:${team.key}`],
    };
  },
};
