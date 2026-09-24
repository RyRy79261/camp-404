import {
  formatMoneyTotals,
  tallyActivationCompletion,
  type MoneyTotal,
  type RequiredActionStatus,
} from "@camp404/core";
import type { TeamConfigEntry } from "@/lib/camp-config";
import type { TeamCoverage } from "@/lib/roster";
import { deriveRosterStats, type RosterRow } from "@/lib/camp-roster";
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
 * store models the payments ledger, but of `required_actions` only the burner
 * profile gate (no questionnaire sends), so it reports a
 * `pendingRequiredActions` that misses every send — a figure that would read
 * as "the camp is clear". That stage, and every stage below it, is marked
 * unknown instead. A deployment that cannot read the ledger says `dues: false`.
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

// --- The KPI row ----------------------------------------------------------

/** One card on the board's top row: a headline figure and its way in. */
export interface Kpi {
  key: string;
  label: string;
  /**
   * The figure — or NULL when this deployment cannot read the fact behind it,
   * on the funnel's rule: a zero is a claim. "0 dues paid" reads as "nobody has
   * paid", which is a different thing from "we cannot tell".
   */
  value: number | null;
  /** The line under the figure: what it is over, or why there isn't one. */
  hint: string;
  href: string;
}

/**
 * The four headline figures above the funnel: how big the camp is, who is
 * waiting on a captain, how far the dues have come in, and what is collecting
 * answers right now.
 *
 * `openSends` is null where the deployment cannot list open sends (the E2E test
 * store returns an empty map whether or not a send is open), and `known.dues`
 * says whether the payments ledger can be read. Either unknown is marked
 * unavailable rather than counted, for the reason the funnel marks its rungs
 * unknown and the completion card withholds itself.
 *
 * `received` is this year's money seen in the bank, one total per currency.
 * It is written after the count exactly as it is: no FX, so a rand total and a
 * dollar total are never added into one figure.
 */
export function deriveKpis(
  rows: readonly RosterRow[],
  openSends: number | null,
  known: Pick<KnownFacts, "dues">,
  received: readonly MoneyTotal[] | null = null,
): Kpi[] {
  const stats = deriveRosterStats(rows);
  const approved = rows.filter((r) => r.approvalStatus === "approved");
  const paid = approved.filter((r) => r.duesPaid).length;

  return [
    {
      key: "members",
      label: "Members",
      value: stats.approved,
      hint: `${stats.captains} captain${stats.captains === 1 ? "" : "s"}`,
      href: "/captains/camp-management",
    },
    {
      key: "pending",
      label: "Awaiting approval",
      value: stats.pending,
      hint:
        stats.pending === 0 ? "Nobody waiting" : "Open the roster to decide",
      href: "/captains/camp-management",
    },
    {
      key: "dues",
      label: "Dues paid",
      value: known.dues ? paid : null,
      hint: known.dues
        ? received
          ? `of ${approved.length} approved · ${formatMoneyTotals(received)}`
          : `of ${approved.length} approved`
        : "The ledger cannot be read here",
      href: "/captains/payments",
    },
    {
      key: "sends",
      label: "Open sends",
      value: openSends,
      hint:
        openSends === null
          ? "Open sends cannot be read here"
          : openSends === 0
            ? "No questionnaire is open"
            : "Questionnaires collecting answers",
      href: "/captains/questionnaires",
    },
  ];
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
  /**
   * A team key the camp config does not name at all. The roster page validates
   * `?team=` against the configured teams, so such a key has no filter to link
   * to and no option in the filter dropdown — the row states the fact instead
   * of pretending to a link that would quietly open the whole camp.
   */
  unconfigured: boolean;
  /** The roster, filtered to this team — null when there is no filter for it. */
  href: string | null;
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
      unconfigured: false,
      href: rosterTeamHref(team.key),
    });
  }

  // A team key that carries members but is missing from the config entirely
  // (an enum value no config entry names) is still a team people are on.
  //
  // It gets NO link and it is not called "Archived": nobody archived it. The
  // roster page checks `?team=` against the configured teams and falls back to
  // the unfiltered roster, so a link here would answer a row saying "3 members"
  // with the entire camp — the captain would read the whole roster as that
  // team's people.
  const known = new Set(configured.map((t) => t.key));
  for (const entry of coverage) {
    if (known.has(entry.team) || entry.members === 0) continue;
    rows.push({
      key: entry.team,
      label: entry.team,
      members: entry.members,
      leads: entry.leads,
      hasLead: entry.leads > 0,
      archived: false,
      unconfigured: true,
      href: null,
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
  /** The burn year this send was stamped with — the year its results live in. */
  cycle: number;
  /** Gates this send holds now — reach, not reach ever. */
  sent: number;
  completed: number;
  /** `pending + completed`: waived and expired gates leave the denominator. */
  eligible: number;
  completionPct: number;
  /** Its results page. */
  href: string;
}

/**
 * A send's results, the aggregate view, FOR THE YEAR THAT SEND BELONGS TO.
 *
 * The `?cycle=` is not decoration. A questionnaire marked carry-over keeps its
 * open activation across a rollover (`advanceCycle`'s `carriesOver` bucket does
 * nothing to it), so an open send stamped with last year's cycle is an ordinary
 * state. Without the year, `loadResults` falls back to `cycleOptions[0]` — the
 * current year — and `listActivationsForCycle` finds no activation there, so the
 * page the captain lands on prints no completion figure at all while the row
 * they clicked said "8 / 12 · 67%".
 */
export function sendResultsHref(
  questionnaireKey: string,
  cycle: number,
): string {
  return `/captains/questionnaires/${encodeURIComponent(questionnaireKey)}/metrics?cycle=${cycle}`;
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
      cycle: row.cycle,
      sent: tally.sent,
      completed: tally.completed,
      eligible: tally.eligible,
      completionPct: tally.completionPct,
      href: sendResultsHref(row.questionnaireKey, row.cycle),
    };
  });
}
