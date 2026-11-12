import type { TelegramReach } from "@camp404/db/team-glance";
import {
  ATTENTION_LIMIT,
  plural,
  type GlanceAttention,
  type GlanceLink,
  type GlanceTile,
  type TeamGlance,
} from "../team-glance";

// The Communications & HR team's panel on its team page ("Is the camp
// listening?"; approved mock-up docs/plans/2026-11-12-team-dashboards-mockup.html).
// What every member sees: the open questionnaire sends with how many answered
// of how many asked (every member reads every questionnaire, owner
// 2026-10-23) and the announcements sent this month. What only some see,
// decided on the server before the read: how many connected Ol' Jeb
// (TELEGRAM_REACH_READER: captains and Comms leads) and the sign-ups waiting
// for approval (team lead and up). A part the viewer may not see, or that
// this deployment cannot know (the E2E store models no send), arrives as null
// and is left out. Counts only. Pure.

export const COMMS_LINKS = {
  announcements: { href: "/captains/announcements", label: "Announcements" },
  questionnaires: { href: "/captains/questionnaires", label: "Questionnaires" },
  joinSite: { href: "/captains/join-site", label: "Join site" },
  roster: { href: "/captains/camp-management", label: "Roster" },
} as const;

export const COMMS_MEMBER_NOTE =
  "Sign-ups waiting for approval are for team leads and captains.";

/** One open send: its title, who answered and who was asked. */
export interface SendProgress {
  key: string;
  title: string;
  completed: number;
  /** Asked and still counted (answered plus still waiting). */
  eligible: number;
}

export interface CommsGlanceInput {
  /** null: not known here (the E2E store models no send). */
  sends: readonly SendProgress[] | null;
  announcementsThisMonth: number;
  /** null: the viewer is not a captain or a Comms lead. */
  telegram: TelegramReach | null;
  /** null: the viewer is below team lead. */
  pendingApprovals: number | null;
  /** The viewer is team lead and up (they write announcements). */
  canAnnounce: boolean;
  isCaptain: boolean;
}

export function commsGlance(input: CommsGlanceInput): TeamGlance {
  const { sends, telegram, pendingApprovals } = input;
  const tiles: GlanceTile[] = [];
  if (sends) {
    const waiting = sends.filter((s) => s.eligible > s.completed).length;
    tiles.push({
      key: "sends",
      label: "Open questionnaires",
      value: String(sends.length),
      hint:
        sends.length === 0
          ? "none open right now"
          : waiting > 0
            ? `${waiting} still waiting on answers`
            : "everyone asked has answered",
    });
  }
  if (telegram) {
    tiles.push({
      key: "telegram",
      label: "Telegram connected",
      value: `${telegram.connected} of ${telegram.members}`,
      hint: "get their notices from Ol' Jeb",
      progress:
        telegram.members > 0
          ? { value: telegram.connected, max: telegram.members }
          : undefined,
    });
  }
  if (pendingApprovals !== null) {
    tiles.push({
      key: "approvals",
      label: "Waiting for approval",
      value: String(pendingApprovals),
      hint: pendingApprovals === 1 ? "new sign-up" : "new sign-ups",
      tone: pendingApprovals > 0 ? "warn" : undefined,
    });
  }
  tiles.push({
    key: "announcements",
    label: "Sent this month",
    value: String(input.announcementsThisMonth),
    hint: input.announcementsThisMonth === 1 ? "announcement" : "announcements",
  });

  const attention: GlanceAttention[] = [];
  if (pendingApprovals) {
    attention.push({
      key: "approvals",
      tone: "warn",
      text: `${plural(pendingApprovals, "new sign-up")} ${pendingApprovals === 1 ? "waits" : "wait"} for a captain's approval.`,
      link: COMMS_LINKS.roster,
    });
  }
  for (const send of sends ?? []) {
    const left = send.eligible - send.completed;
    if (left <= 0) continue;
    attention.push({
      key: `send-${send.key}`,
      tone: "warn",
      text: `${send.title}: ${plural(left, "person", "people")} ${left === 1 ? "has" : "have"} not answered.`,
      link: COMMS_LINKS.questionnaires,
    });
  }

  const links: GlanceLink[] = [];
  if (input.canAnnounce) links.push(COMMS_LINKS.announcements);
  links.push(COMMS_LINKS.questionnaires);
  if (input.isCaptain) links.push(COMMS_LINKS.joinSite);

  return {
    title: "Is the camp listening?",
    tiles,
    bars:
      sends && sends.length > 0
        ? [
            {
              heading: "Answers so far",
              rows: sends.map((s) => ({
                key: s.key,
                label: s.title,
                value: `${s.completed} of ${s.eligible}`,
                progress: { value: s.completed, max: s.eligible },
              })),
            },
          ]
        : undefined,
    attention: attention.slice(0, ATTENTION_LIMIT),
    links,
    note: pendingApprovals === null ? COMMS_MEMBER_NOTE : undefined,
  };
}
