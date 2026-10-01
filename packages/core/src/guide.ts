import { DutyCard, Team, ViewerRank, type DutyCardDraft } from "@camp404/types";

// The Survival Guide (#250). Pure: no DB, no session, no next/*.
//
// WHO MAY WRITE A CHAPTER (owner, 2026-09-30: "captains write everything, a
// team's leads write their team's chapters"): a captain writes any chapter; a
// lead writes the chapters of a team they lead this year; a chapter with no
// team is a captain's. Clearance stays global (AGENTS.md): a lead of any team
// stands on the `team_lead` rung everywhere, and team identity decides only
// which chapters a lead may write, as canEditInventory does for gear. Every
// approved member reads every published chapter.
//
// It fails closed: a rank this module does not know, or a team key that is
// not a team, answers false, a captain's included. Each write re-reads the
// actor's rank and led teams inside its own transaction and passes those
// here; it never takes a team list from the caller.

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may write a chapter of `team` (null: a whole-camp chapter):
 * create it, save its draft, publish or withdraw it, and mark it reviewed.
 * `ledTeams` are the team keys they lead this year.
 */
export function canEditGuideChapter(
  rank: string,
  ledTeams: readonly string[],
  team: string | null,
): boolean {
  if (!isViewerRank(rank)) return false;
  if (team !== null && !Team.safeParse(team).success) return false;
  if (rank === "captain") return true;
  if (rank !== "team_lead" || team === null) return false;
  return ledTeams.includes(team);
}

/** Whether someone may write at least one chapter (the New chapter button). */
export function canEditAnyGuideChapter(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return Team.options.some((team) => canEditGuideChapter(rank, ledTeams, team));
}

/**
 * Whether someone may mark a chapter Public (owner, 2026-09-30: public
 * chapters are marked one by one, by captains). Only a captain. Nothing serves
 * a public chapter to anyone signed out yet; that is the guide's own app, a
 * later slice.
 */
export function canSetGuideChapterPublic(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

/**
 * What the contents list says beside a chapter for one reader: "new" when they
 * have never opened it, "updated" when a newer version was published since
 * they last did, nothing when they have read the version that is up.
 */
export function guideReadMark(
  publishedVersion: number,
  readVersion: number | null | undefined,
): "new" | "updated" | null {
  if (readVersion === null || readVersion === undefined) return "new";
  return readVersion < publishedVersion ? "updated" : null;
}

/**
 * Whether a published chapter still waits for this year's review: it was last
 * published or marked reviewed in an earlier burn year. A chapter is kept from
 * year to year; an editor reads it again and either keeps it or publishes a
 * new version.
 */
export function guideReviewDue(
  cycleReviewed: number | null,
  currentYear: number | null,
): boolean {
  if (currentYear === null) return false;
  return cycleReviewed === null || cycleReviewed < currentYear;
}

/**
 * Why a duty card cannot be published yet, in the first sentence its check
 * gives, or null when it is ready. A card in this state may still be saved as
 * a draft.
 */
export function dutyCardProblem(card: DutyCardDraft | null): string | null {
  if (!card) return "A duty card needs its card filled in.";
  const parsed = DutyCard.safeParse(card);
  return parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? "Check the card.");
}

/** A sub-role's headcount as the card prints it: "2" or "2–3". */
export function headcountLabel(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}
