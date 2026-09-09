import { notFound, redirect } from "next/navigation";
import { deriveViewerRank } from "@camp404/core";
import {
  flattenBuilderQuestions,
  type Question,
  type QuestionnaireResponses,
} from "@camp404/types";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  listActivationResponses,
  listActivationsForCycle,
  listResultCycles,
  type ActivationResponseRow,
  type ResultsActivationRow,
} from "@camp404/db/questionnaire-results";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getCurrentCycle } from "@/lib/camp-config";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

// The shared loader behind BOTH results routes. /metrics and /responses answer
// two different questions about exactly the same data — the aggregate and the
// individual — so the gate, the year resolution and the read live here once and
// the two pages stay thin. It sits under metrics/ because that is the route the
// spec reserves first; /responses imports it.

/** Every questionnaire the results surfaces can be asked about. */
export interface ResultsView {
  key: string;
  title: string;
  /** Every input field in the CURRENT head definition, in document order. */
  questions: Question[];
  /** The year being viewed. */
  cycle: number;
  /** The years with something to show, newest first — the year switcher. */
  cycleOptions: number[];
  /** The year the camp is in, or null before a captain has named one. */
  currentCycle: number | null;
  rows: ActivationResponseRow[];
  /** Every send in `cycle`, newest first. */
  activations: ResultsActivationRow[];
  /** The send whose gates the reach figures describe: the open one, else the newest. */
  activeActivation: ResultsActivationRow | null;
}

export type ResultsAccess =
  /** Not a captain. Results are PII; the data is never read, let alone sent. */
  | { ok: false; reason: "locked" }
  /** Never published, so it was never sent and cannot have answers. */
  | { ok: false; reason: "draft" }
  | { ok: true; view: ResultsView };

/**
 * Load one questionnaire's results for one year, or the reason the viewer
 * can't have them.
 *
 * The rank check runs BEFORE any results read: a team lead must not be able to
 * make the server fetch answers it will then decline to render (§4.1 — "data
 * withheld server-side"). `deriveViewerRank(rank, false)` skips the isTeamLead
 * lookup deliberately; this surface is captain-only, so lead-ness cannot change
 * the outcome.
 */
export async function loadResults(
  key: string,
  cycleParam?: string,
): Promise<ResultsAccess> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }
  if (deriveViewerRank(campUser.rank, false) !== "captain") {
    return { ok: false, reason: "locked" };
  }

  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  // `unpublished` still has results — taking a questionnaire offline preserves
  // its answers (§6.3). Only a definition that was NEVER published has none.
  if (meta.status === "draft") return { ok: false, reason: "draft" };

  // Aggregated against the HEAD definition, not the version each respondent
  // answered: the head is the questionnaire the captain is looking at, and a
  // published questionnaire can be edited, so the two routinely differ. The
  // aggregation is built to survive that gap honestly (@camp404/core's
  // `aggregateQuestions`, and the four properties it pins) rather
  // than to pretend it doesn't exist.
  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();

  const [cycles, current] = await Promise.all([
    listResultCycles(key),
    getCurrentCycle(),
  ]);
  const currentCycle = current?.year ?? null;
  const cycleOptions = [
    ...new Set([...(currentCycle === null ? [] : [currentCycle]), ...cycles]),
  ].sort((a, b) => b - a);
  if (cycleOptions.length === 0) cycleOptions.push(UNSET_CYCLE);

  // An unknown ?cycle= falls back to the newest year rather than 404ing: a
  // stale bookmark from before a rollover should land somewhere useful.
  const requested = Number(cycleParam);
  const cycle =
    Number.isInteger(requested) && cycleOptions.includes(requested)
      ? requested
      : cycleOptions[0]!;

  const [rows, activations] = await Promise.all([
    listActivationResponses({ definitionKey: key, cycle }),
    listActivationsForCycle(key, cycle),
  ]);

  return {
    ok: true,
    view: {
      key,
      title: definition.title || key,
      questions: flattenBuilderQuestions(definition),
      cycle,
      cycleOptions,
      currentCycle,
      rows,
      activations,
      activeActivation:
        activations.find((a) => a.status === "open") ?? activations[0] ?? null,
    },
  };
}

/** One member's finished answers for the year being viewed. */
export interface Respondent {
  userId: string;
  name: string;
  profileImageUrl: string | null;
  completedAt: Date;
  definitionVersion: string | null;
  responses: QuestionnaireResponses;
}

export function memberName(displayName: string | null): string {
  return displayName?.trim() || "Unnamed member";
}

/**
 * The rows that count as ANSWERS: a finished response stored in this cycle.
 *
 * `completedAt` is the discriminator, not the presence of a response row — the
 * runner upserts on every page advance, so a half-filled form has a row too.
 * Counting those would inflate every total and turn abandoned drafts into
 * skipped questions.
 */
export function respondentsOf(view: ResultsView): Respondent[] {
  return view.rows
    .filter((r) => r.completedAt !== null)
    .map((r) => ({
      userId: r.userId,
      name: memberName(r.displayName),
      profileImageUrl: r.profileImageUrl,
      completedAt: r.completedAt!,
      definitionVersion: r.definitionVersion,
      responses: r.responses ?? {},
    }))
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
}

export interface ResultsSummary {
  /** Finished responses stored in this cycle. */
  respondents: number;
  /** Response rows started and not finished in this cycle. */
  inProgress: number;
  /** Members the ACTIVE send reached — see the note on `reachIsPartial`. */
  sent: number;
  /** Of those, still pending. */
  outstanding: number;
  /** completed / (pending + completed) over the active send, or null. */
  completionPercent: number | null;
  /**
   * True when this year holds answers the active send's gates cannot account
   * for — an earlier send of the same questionnaire, whose `required_actions`
   * rows the re-send overwrote in place. Prior reach is not reconstructable
   * (§7.1), so the surface says so rather than quietly printing a completion
   * rate over the wrong denominator.
   */
  reachIsPartial: boolean;
}

/** The counts both results routes put at the top of the page. */
export function summarise(view: ResultsView): ResultsSummary {
  const respondents = view.rows.filter((r) => r.completedAt !== null).length;
  const inProgress = view.rows.filter(
    (r) => r.responses !== null && r.completedAt === null,
  ).length;

  const activeId = view.activeActivation?.id ?? null;
  const gates = activeId
    ? view.rows.filter((r) => r.gateActivationId === activeId)
    : [];
  const completed = gates.filter((g) => g.gateStatus === "completed").length;
  const outstanding = gates.filter((g) => g.gateStatus === "pending").length;
  // §7.1: waived and expired rows leave the denominator — neither is an
  // outstanding obligation, and neither is an answer.
  const denominator = completed + outstanding;

  return {
    respondents,
    inProgress,
    sent: gates.length,
    outstanding,
    completionPercent:
      denominator === 0 ? null : Math.round((completed / denominator) * 100),
    reachIsPartial: respondents > gates.length,
  };
}

/** The label for a year, distinguishing the sentinel from a real burn year. */
export function cycleLabel(cycle: number, currentCycle: number | null): string {
  if (cycle === UNSET_CYCLE && currentCycle === null) return "This year";
  return String(cycle);
}

export interface ResultsEmpty {
  title: string;
  description: string;
}

/**
 * The empty state for a year with no finished answers, or null when there are
 * some. Three genuinely different situations, and telling a captain the wrong
 * one sends them looking for a bug that isn't there:
 *
 *   - nothing was sent this year at all;
 *   - a send was opened and CLOSED before anyone answered (the answers are not
 *     missing — there never were any);
 *   - a send is open and nobody has finished yet.
 */
export function emptyStateFor(
  view: ResultsView,
  respondents: number,
): ResultsEmpty | null {
  if (respondents > 0) return null;
  const year = cycleLabel(view.cycle, view.currentCycle);
  if (view.activations.length === 0) {
    return {
      title: `Not sent in ${year}`,
      description:
        "This questionnaire wasn't sent to anyone this year, so there's nothing to show. Send it to start collecting answers.",
    };
  }
  if (view.activations.every((a) => a.status === "closed")) {
    return {
      title: "Closed before anyone answered",
      description:
        "This send was closed with no answers in. Nothing was lost — send it again when you're ready to collect.",
    };
  }
  return {
    title: "No answers yet",
    description:
      "Answers appear here as members finish the form. Nobody has submitted one yet.",
  };
}
