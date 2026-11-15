import { GATES, type ToolCapability } from "../gates";

// Captains' own records on members: their private notes (the member panel on
// Camp management) and this year's tickets, DDTs and WAPs (Applications).
// Captains only, as on those pages: a team lead reads none of either.
// Approvals, places this year, ranks and reset links stay on the website.

export const CAPTAIN_PEOPLE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  list_member_notes: {
    kind: "read",
    area: "Member records",
    gate: GATES.captain,
    does: "Read the captains' private notes on one member (each read is recorded).",
    page: "/captains/camp-management",
  },
  add_member_note: {
    kind: "write",
    area: "Member records",
    gate: GATES.captain,
    does: "Add a captains' private note to a member. The member never sees it.",
    page: "/captains/camp-management",
  },
  list_tickets: {
    kind: "read",
    area: "Member records",
    gate: GATES.captain,
    does: "Every approved member's ticket status, DDT and WAP this year, with where they stand.",
    page: "/captains/applications",
  },
  set_ticket_pass: {
    kind: "write",
    area: "Member records",
    gate: GATES.captain,
    does: "Set a member's ticket status, DDT or WAP for this year.",
    page: "/captains/applications",
  },
};
