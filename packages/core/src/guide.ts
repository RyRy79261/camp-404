import {
  DUTY_CARD_NO_MEMBERS_ONLY,
  DUTY_CARD_NO_PHONE,
  DutyCard,
  Team,
  ViewerRank,
  containsPhoneNumber,
  hasMembersOnlyPart,
  membersOnlyProblem,
  type DutyCardDraft,
} from "@camp404/types";

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
 * Whether someone may put a whole section (topic) on the public site, or take
 * it off (owner, 2026-10-04). Only a captain.
 */
export function canSetGuideSectionPublic(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

/**
 * Whether someone may mark a chapter "Keep this whole chapter members only",
 * or clear the mark. Only a captain; a lead sees the mark, read-only.
 */
export function canSetGuideChapterMembersOnly(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

/**
 * Whether a chapter is on the public site: published, in a public section, and
 * not kept members only. A chapter's own mark can only take something away.
 */
export function guideChapterIsPublic(chapter: {
  published: boolean;
  sectionPublic: boolean;
  membersOnly: boolean;
}): boolean {
  return chapter.published && chapter.sectionPublic && !chapter.membersOnly;
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
 * a draft. Its Markdown is checked for a phone number too: the reader shows it
 * on the card, under "Good to know", where it is pinned up on site.
 */
export function dutyCardProblem(
  card: DutyCardDraft | null,
  markdown: string,
): string | null {
  if (!card) return "A duty card needs its card filled in.";
  const parsed = DutyCard.safeParse(card);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Check the card.";
  }
  if (containsPhoneNumber(markdown)) return DUTY_CARD_NO_PHONE;
  // A card is whole-card only: it goes out in full or not at all.
  return hasMembersOnlyPart(markdown) ? DUTY_CARD_NO_MEMBERS_ONLY : null;
}

/**
 * Why a chapter's text cannot be published, or null: its Members only parts
 * must follow the writer's rules (membersOnlyProblem). The Claude connector
 * writes text without the editor, so publishing checks again.
 */
export function chapterTextProblem(markdown: string): string | null {
  return membersOnlyProblem(markdown);
}

/** A sub-role's headcount as the card prints it: "2" or "2–3". */
export function headcountLabel(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

/** A sub-role's headcount in words: "1 person", "2 people", "1–2 people". */
export function headcountText(min: number, max: number): string {
  return `${headcountLabel(min, max)} ${min === max && max === 1 ? "person" : "people"}`;
}

/**
 * Who to ask, split for "Stuck? Ask the <role>." (#250's print): the article
 * the writer typed is kept ("Any captain" asks "any captain"), and a role with
 * none gets "the". Empty when the card names no one yet.
 */
export function askRoleParts(
  askRole: string,
): { article: string; role: string } | null {
  const text = askRole.trim();
  if (text === "") return null;
  const typed = /^(the|a|an|any|your)\s+(.+)$/i.exec(text);
  if (typed) return { article: typed[1]!.toLowerCase(), role: typed[2]! };
  return { article: "the", role: text };
}

/** A duty card as it prints: every part trimmed, and empty lines left out. */
export interface PrintableDutyCard {
  subRoles: { name: string; headcount: string }[];
  steps: string[];
  hardRules: string[];
  checklist: string[];
  ask: { article: string; role: string } | null;
}

/**
 * The parts of a published card, or of a writer's draft, as the duty card
 * print draws them (#250). A draft may still have blank lines and unnamed
 * sub-roles; those are left out, and a section with nothing in it is not
 * drawn at all.
 */
export function printableDutyCard(card: DutyCardDraft): PrintableDutyCard {
  const lines = (list: readonly string[]) =>
    list.map((l) => l.trim()).filter((l) => l !== "");
  return {
    subRoles: card.subRoles
      .filter((r) => r.name.trim() !== "")
      .map((r) => ({
        name: r.name.trim(),
        headcount: headcountText(r.min, Math.max(r.min, r.max)),
      })),
    steps: lines(card.steps),
    hardRules: lines(card.hardRules),
    checklist: lines(card.checklist),
    ask: askRoleParts(card.askRole),
  };
}
