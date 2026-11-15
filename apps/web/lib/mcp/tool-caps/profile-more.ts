import { GATES, type ToolCapability } from "../gates";

// The rest of the person's own profile (owner: every save on the website, but
// website-only things): their name, "What I am in camp", this year's ticket
// and which Telegram notices Ol' Jeb sends them. Always their own: the tools
// take no member id. The photo, ID numbers, Telegram linking and erasing the
// account stay on the website.

export const PROFILE_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_my_profile: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Your name, your camp title and blurb, this year's ticket, DDT and WAP, and your Telegram notices.",
    page: "/profile",
  },
  set_my_display_name: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Change the name the camp sees you by.",
    page: "/profile/edit",
  },
  update_my_camp_blurb: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Change your camp title and blurb (captains: and whether join.camp-404.com shows them).",
    page: "/profile/edit",
  },
  set_my_ticket_status: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Say where your Burn ticket stands this year.",
    page: "/profile",
  },
  set_my_telegram_notices: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Pick which notices Ol' Jeb sends you on Telegram: yours only, or all of them.",
    page: "/profile",
  },
};
