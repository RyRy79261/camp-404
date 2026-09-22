import {
  tallyActivationCompletion,
  type RequiredActionStatus,
} from "@camp404/core";
import type { TeamConfigEntry } from "@/lib/camp-config";
import type { TeamCoverage } from "@/lib/roster";
import type { RosterRow } from "@/lib/camp-roster";
import type { OpenSendGateRow } from "@camp404/db/questionnaire-results";

// The pure derivations behind the captain Overview's status board — the shapes
// AfrikaBurn's console draws as its registration funnel and its coverage rails
// (apps/org/components/status-board/registration-funnel.tsx and coverage.tsx),
// asked of Camp 404's member ladder instead of AfrikaBurn's registrations.
//
// Everything here is pure: rows in, view-model out. No I/O, so the rules that
// decide what a captain reads as "ready" are unit-testable, and the components
// below them render numbers rather than compute them.

// --- The readiness funnel -------------------------------------------------

/** One rung of the member ladder, as the funnel draws it. */
export interface ReadinessStage {
  key: string;
  label: string;
  /**
   * How many members have cleared this rung AND every rung above it — or NULL
   * when this deployment cannot read the fact behind it (see `known`). A null
   * is rendered as "not available here", never as 0: a zero is a claim.
   */
  count: number | null;
  /** The sentence under the bar, describing what the rung means. */
  hint: string;
}

export interface ReadinessFunnel {
  /** Everyone signed up — the denominator every bar is drawn against. */
  total: number;
  stages: ReadinessStage[];
}

/**
 * Which facts of the roster this deployment can actually answer. The E2E test
 * store models no payments ledger and no `required_actions`, so it reports
 * `duesPaid: false` and `pendingRequiredActions: 0` for everyone — figures that
 * would read as "nobody has paid" and "the whole camp is clear". Those stages
 * are marked unknown instead.
 */
export interface KnownFacts {
  /** The payments ledger is readable (the `duesPaid` column means something). */
  dues: boolean;
  /** `required_actions` is readable (`pendingRequiredActions` means something). */
  actions: boolean;
}

/**
 * The member ladder as a funnel: signed up → profile finished → approved →
 * nothing outstanding → dues paid.
 *
 * CUMULATIVE, on purpose. Each stage counts the members who have cleared every
 * stage before it, so the bars can only ever shrink down the ladder and the
 * shape reads as a funnel rather than five unrelated tallies. The consequence
 * is that "Dues paid" here is narrower than the Dues KPI card above it, which
 * answers a different question ("of the approved members, how many have
 * paid?") — the funnel's own description says each stage is cumulative.
 *
 * An unknown stage makes every stage below it unknown too: they are conjunctions
 * of it, so a number there would be an answer to a question this deployment
 * cannot ask.
 */
export function deriveReadinessFunnel(
  rows: readonly RosterRow[],
  known: KnownFacts,
): ReadinessFunnel {
  const signedUp = rows.length;
  const profile = rows.filter((r) => r.onboardingComplete);
  const approved = profile.filter((r) => r.approvalStatus === "approved");
  const clear = approved.filter((r) => r.requiredComplete);
  const paid = clear.filter((r) => r.duesPaid);

  const actionsKnown = known.actions;
  // Dues sit BELOW "nothing outstanding" in the ladder, so an unreadable
  // required-actions table makes the dues count unanswerable as well.
  const duesKnown = known.dues && actionsKnown;

  return {
    total: signedUp,
    stages: [
      {
        key: "signed_up",
        label: "Signed up",
        count: signedUp,
        hint: "Has a camp account",
      },
      {
        key: "profile",
        label: "Profile finished",
        count: profile.length,
        hint: "Burner profile completed",
      },
      {
        key: "approved",
        label: "Approved",
        count: approved.length,
        hint: "A captain has let them in",
      },
      {
        key: "clear",
        label: "Nothing outstanding",
        count: actionsKnown ? clear.length : null,
        hint: "No blocking questionnaire left",
      },
      {
        key: "dues",
        label: "Dues paid",
        count: duesKnown ? paid.length : null,
        hint: "Settled or waived in the ledger",
      },
    ],
  };
}

// --- Per-team coverage ----------------------------------------------------

/** One team on the coverage rail. */
export interface TeamCoverageRow {
  key: string;
  label: string;
  /** Members on the team this year. */
  members: number;
  /** How many of them lead it. */
  leads: number;
  hasLead: boolean;
  /**
   * Archived in the camp config but still carrying members this year. Shown,
   * because people a captain can no longer filter to are people a captain
   * would otherwise lose.
   */
  archived: boolean;
  /** The roster, filtered to this team. */
  href: string;
}

/** The roster page, opened with its team filter already applied. */
export function rosterTeamHref(key: string): string {
  return `/captains/camp-management?team=${encodeURIComponent(key)}`;
}

/**
 * One row per ACTIVE team in the camp's configured order, plus any archived
 * team somebody is still on this year.
 *
 * A team with nobody on it keeps its row at zero: an empty team is the single
 * most useful thing this rail says, and dropping it would hide exactly the
 * teams that need someone. The counts come from the year-scoped grouped read,
 * so at a rollover every row reads 0 with no lead until captains rebuild them.
 */
export function deriveTeamCoverage(
  coverage: readonly TeamCoverage[],
  teams: readonly TeamConfigEntry[],
): TeamCoverageRow[] {
  const counts = new Map(coverage.map((c) => [c.team as string, c]));
  const configured = [...teams].sort((a, b) => a.order - b.order);

  const rows: TeamCoverageRow[] = [];
  for (const team of configured) {
    const found = counts.get(team.key);
    // An archived team with nobody left on it is simply gone from the board.
    if (team.archived && (found?.members ?? 0) === 0) continue;
    rows.push({
      key: team.key,
      label: team.label,
      members: found?.members ?? 0,
      leads: found?.leads ?? 0,
      hasLead: (found?.leads ?? 0) > 0,
      archived: team.archived,
      href: rosterTeamHref(team.key),
    });
  }

  // A team key that carries members but is missing from the config entirely
  // (an enum value no config entry names) is still a team people are on.
  const known = new Set(configured.map((t) => t.key));
  for (const entry of coverage) {
    if (known.has(entry.team) || entry.members === 0) continue;
    rows.push({
      key: entry.team,
      label: entry.team,
      members: entry.members,
      leads: entry.leads,
      hasLead: entry.leads > 0,
      archived: true,
      href: rosterTeamHref(entry.team),
    });
  }

  return rows;
}

// --- Questionnaire completion ---------------------------------------------

/** One open send, as the completion rail describes it. */
export interface SendCompletion {
  activationId: string;
  questionnaireKey: string;
  title: string;
  /** Gates this send holds now — reach, not reach ever. */
  sent: number;
  completed: number;
  /** `pending + completed`: waived and expired gates leave the denominator. */
  eligible: number;
  completionPct: number;
  /** Its results page. */
  href: string;
}

/** A send's results, the aggregate view. */
export function sendResultsHref(questionnaireKey: string): string {
  return `/captains/questionnaires/${encodeURIComponent(questionnaireKey)}/metrics`;
}

/**
 * One row per open send, in the order the read returned them.
 *
 * The arithmetic is `tallyActivationCompletion` (@camp404/core) and nothing
 * else: waived and expired gates leave the denominator there, and a second
 * implementation of that rule on the Overview would be a second answer to
 * "what percent is done". A send with no gates at all still gets a row, at
 * 0 of 0 — it reached nobody, which is a thing a captain needs to see.
 */
export function deriveSendCompletion(
  gates: readonly OpenSendGateRow[],
): SendCompletion[] {
  const sends = new Map<
    string,
    { row: OpenSendGateRow; statuses: RequiredActionStatus[] }
  >();
  for (const gate of gates) {
    const entry = sends.get(gate.activationId) ?? { row: gate, statuses: [] };
    // A null status is the LEFT JOIN's "this send holds no gates" row, not a
    // member: counting it would invent a recipient.
    if (gate.status) entry.statuses.push(gate.status);
    sends.set(gate.activationId, entry);
  }

  return [...sends.values()].map(({ row, statuses }) => {
    const tally = tallyActivationCompletion(statuses);
    return {
      activationId: row.activationId,
      questionnaireKey: row.questionnaireKey,
      title: row.title,
      sent: tally.sent,
      completed: tally.completed,
      eligible: tally.eligible,
      completionPct: tally.completionPct,
      href: sendResultsHref(row.questionnaireKey),
    };
  });
}
