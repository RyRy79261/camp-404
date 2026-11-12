import { Megaphone } from "lucide-react";
import {
  campDayKey,
  campDayStart,
  hasClearance,
  tallyActivationCompletion,
  TELEGRAM_REACH_READER,
} from "@camp404/core";
import type { RequiredActionStatus } from "@camp404/db/questionnaire-results";
import { listOpenSendGates } from "@/lib/questionnaire-definitions";
import { getCampHeadcount } from "@/lib/roster";
import {
  countAnnouncementsSince,
  countTelegramReach,
} from "@/lib/team-glance-counts";
import { commsGlance, type SendProgress } from "@/lib/team-glance/comms";
import { usesTestStore } from "@/lib/test-mode";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// The Communications & HR team's own panel on its team page. Every member
// reads the open sends' answers so far and the month's announcements; the
// parts some may not see are not READ for them at all: Ol' Jeb's reach for a
// captain or a Comms lead (TELEGRAM_REACH_READER), the sign-ups waiting for
// approval for team lead and up. The E2E store models no questionnaire send,
// so there the sends are "not known", not "none" (as the captains' Overview
// does).

/** One open send's gates, added up the Overview's way. */
function sendProgress(
  gates: readonly {
    activationId: string;
    title: string;
    status: RequiredActionStatus | null;
  }[],
): SendProgress[] {
  const sends = new Map<
    string,
    { title: string; statuses: RequiredActionStatus[] }
  >();
  for (const gate of gates) {
    const entry = sends.get(gate.activationId) ?? {
      title: gate.title,
      statuses: [],
    };
    // A null status is the LEFT JOIN's "no gates" row, not a member.
    if (gate.status) entry.statuses.push(gate.status);
    sends.set(gate.activationId, entry);
  }
  return [...sends.entries()].map(([key, { title, statuses }]) => {
    const tally = tallyActivationCompletion(statuses);
    return { key, title, completed: tally.completed, eligible: tally.eligible };
  });
}

export async function CommsProgramPanel({ rank, actor, now }: TeamPanelProps) {
  const readsReach = TELEGRAM_REACH_READER.allows(actor);
  const readsApprovals = hasClearance(rank, "team_lead");
  const monthStart = campDayStart(`${campDayKey(now).slice(0, 7)}-01`);
  const [gates, announcements, telegram, headcount] = await Promise.all([
    usesTestStore() ? null : listOpenSendGates(),
    countAnnouncementsSince(monthStart),
    readsReach ? countTelegramReach() : null,
    readsApprovals ? getCampHeadcount() : null,
  ]);
  return (
    <TeamGlanceCard
      id="comms"
      icon={Megaphone}
      glance={commsGlance({
        sends: gates ? sendProgress(gates) : null,
        announcementsThisMonth: announcements,
        telegram,
        pendingApprovals: headcount ? headcount.waiting : null,
        canAnnounce: readsApprovals,
        isCaptain: rank === "captain",
      })}
    />
  );
}
