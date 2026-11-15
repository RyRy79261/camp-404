import { GATES, type ToolCapability } from "../gates";

// The words of join.camp-404.com, the camp's public recruiting page, as the
// Join site editor keeps them: captains only. A save is live on the public
// site at once (it refreshes within a minute). The fee scale moves money and
// the Burn's dates are the camp's year settings: both stay on the website.

export const JOIN_SITE_CAPABILITIES: Readonly<Record<string, ToolCapability>> =
  {
    get_join_page: {
      kind: "read",
      area: "Join site",
      gate: GATES.captain,
      does: "Read join.camp-404.com's words, section by section, with each section's version.",
      page: "/captains/join-site",
    },
    update_join_page_section: {
      kind: "write",
      area: "Join site",
      gate: GATES.captain,
      does: "Replace one section of join.camp-404.com's words. Live on the public site at once.",
      page: "/captains/join-site",
    },
    update_join_team_line: {
      kind: "write",
      area: "Join site",
      gate: GATES.captain,
      does: "Change the line join.camp-404.com shows for what a team does. Live on the public site at once.",
      page: "/captains/join-site",
    },
  };
