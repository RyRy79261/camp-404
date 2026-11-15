import { GATES, type ToolCapability } from "../gates";

// Announcements as the page's composer keeps them: a captain or a team lead
// (to a team they lead) writes and changes drafts and pins a published one.
// Publishing a draft reaches people, so it stays on the website, and so does
// deleting one.

export const ANNOUNCEMENTS_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  list_announcements: {
    kind: "read",
    area: "Announcements",
    gate: GATES.teamLead,
    does: "Announcements and drafts as the page lists them (team leads: your own), with who they are for and whether pinned.",
    page: "/captains/announcements",
  },
  save_announcement_draft: {
    kind: "write",
    area: "Announcements",
    gate: GATES.teamLead,
    does: "Write a new announcement draft. Nothing is sent: publishing is on the website.",
    page: "/captains/announcements",
  },
  update_announcement_draft: {
    kind: "write",
    area: "Announcements",
    gate: GATES.teamLead,
    does: "Change your own draft's title, words, how it lands or who it is for.",
    page: "/captains/announcements",
  },
  set_announcement_pinned: {
    kind: "write",
    area: "Announcements",
    gate: GATES.teamLead,
    does: "Pin a published announcement to the top of its readers' screens, or take the pin down. Sends nothing.",
    page: "/captains/announcements",
  },
};
