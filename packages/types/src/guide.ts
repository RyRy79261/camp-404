import { z } from "zod";
import { Team } from "./roles";

// The Survival Guide (#250): the camp's chapters, written in the app and read
// by every approved member. A chapter is Markdown; a duty card is a chapter
// with a fixed shape (sub-roles, ordered steps, hard rules, the lead's
// end-of-shift checklist, who to ask), pinned up on site. Who may write which
// chapter is the server's rule (canEditGuideChapter in @camp404/core), never
// this shape's.

/** The topics the guide is grouped by, in reading order. */
export const GUIDE_CATEGORIES = [
  "before_you_come",
  "on_site",
  "kitchen",
  "safety",
  "teams",
] as const;
export const GuideCategory = z.enum(GUIDE_CATEGORIES, {
  message: "Pick a topic.",
});
export type GuideCategory = z.infer<typeof GuideCategory>;

export const GUIDE_CATEGORY_LABELS: Readonly<Record<GuideCategory, string>> = {
  before_you_come: "Before you come",
  on_site: "On site",
  kitchen: "Kitchen",
  safety: "Safety",
  teams: "Teams",
};

/** A plain chapter, or a duty card with its fixed shape. */
export const GUIDE_CHAPTER_KINDS = ["chapter", "duty_card"] as const;
export const GuideChapterKind = z.enum(GUIDE_CHAPTER_KINDS);
export type GuideChapterKind = z.infer<typeof GuideChapterKind>;

export const GUIDE_TITLE_MAX = 120;
export const GUIDE_MARKDOWN_MAX = 100_000;
export const GUIDE_SLUG_MAX = 48;

/** URL words the guide's own pages use, so no chapter can take them. */
export const RESERVED_GUIDE_SLUGS: ReadonlySet<string> = new Set(["new"]);

export const GuideSlug = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Lowercase letters, digits and single hyphens, like kitchen-safety.",
  )
  .max(GUIDE_SLUG_MAX)
  .refine((slug) => !RESERVED_GUIDE_SLUGS.has(slug), "Pick another title.");

const Title = z
  .string()
  .trim()
  .min(1, "Give the chapter a title.")
  .max(GUIDE_TITLE_MAX, `Keep the title under ${GUIDE_TITLE_MAX} characters.`);

// --- "Members only" parts (#250's public site) ---------------------------------
//
// A part of a chapter kept for camp members is a fenced block at the top level
// of the Markdown:
//
//     :::members
//     ## The convoy plan
//     We leave together on the Tuesday …
//     :::
//
// The opener line is exactly `:::members`, the closer exactly `:::`, neither
// indented nor inside a list, a quote or a code block, and blocks do not nest.
// These are the WRITER's rules, checked on save and on publish. The public
// site does not trust them: @camp404/core's publicMarkdown cuts anything that
// even looks like an opener, so a text that slipped past these rules loses
// too much on the public page, never too little.

export const MEMBERS_ONLY_OPEN = ":::members";
export const MEMBERS_ONLY_CLOSE = ":::";

/** A code fence's opening run (``` or ~~~, up to three spaces in). */
export const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A line that looks like a members-only opener, wherever it sits: indented,
 * after quote or list markers, any case, with spaces. The strict rules accept
 * only the bare `:::members`; the public stripper cuts at any of these.
 */
export function looksLikeMembersOpener(line: string): boolean {
  const body = line.replace(/^(?:\s|>|[-*+](?=\s)|\d{1,9}[.)](?=\s))*/, "");
  return /^:{3,}\s*members\b/i.test(body);
}

export const MEMBERS_ONLY_UNCLOSED =
  "A Members only part is not closed: end it with a line that holds only :::.";
export const MEMBERS_ONLY_NESTED =
  "A Members only part can't hold another one.";
export const MEMBERS_ONLY_MISPLACED =
  "A Members only part starts on its own line at the left edge, not inside a list, a quote or a code block.";
export const MEMBERS_ONLY_STRAY =
  "A line that holds only ::: ends a Members only part, and none is open there.";
export const DUTY_CARD_NO_MEMBERS_ONLY =
  'A duty card is pinned up for anyone to read: it can\'t have a Members only part. Tick "Keep this whole chapter members only" instead.';

/**
 * Why `markdown`'s Members only parts break the writer's rules, in a sentence
 * the writer can act on, or null when they hold.
 */
export function membersOnlyProblem(markdown: string): string | null {
  let open = false;
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (fence !== null) {
      // Inside a code block: only its own closing run ends it.
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) {
        fence = null;
      } else if (looksLikeMembersOpener(line)) {
        return MEMBERS_ONLY_MISPLACED;
      }
      continue;
    }
    const code = CODE_FENCE.exec(line);
    if (code) {
      fence = code[1]!;
      continue;
    }
    if (line === MEMBERS_ONLY_OPEN) {
      if (open) return MEMBERS_ONLY_NESTED;
      open = true;
      continue;
    }
    if (looksLikeMembersOpener(line)) {
      return open ? MEMBERS_ONLY_NESTED : MEMBERS_ONLY_MISPLACED;
    }
    if (line === MEMBERS_ONLY_CLOSE) {
      if (!open) return MEMBERS_ONLY_STRAY;
      open = false;
      continue;
    }
    if (line.trim() === MEMBERS_ONLY_CLOSE) return MEMBERS_ONLY_MISPLACED;
  }
  return open ? MEMBERS_ONLY_UNCLOSED : null;
}

/** Whether `markdown` has anything that looks like a Members only part. */
export function hasMembersOnlyPart(markdown: string): boolean {
  return markdown.split(/\r?\n/).some(looksLikeMembersOpener);
}

/** A chapter's Markdown: in bounds, and its Members only parts well formed. */
export const GuideMarkdown = z
  .string()
  .max(GUIDE_MARKDOWN_MAX, "The chapter is too long. Split it in two.")
  .superRefine((text, ctx) => {
    const problem = membersOnlyProblem(text);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const Markdown = GuideMarkdown;

// --- Duty cards ---------------------------------------------------------------

export const DUTY_CARD_MAX = {
  subRoles: 10,
  steps: 30,
  hardRules: 15,
  checklist: 20,
  line: 300,
  name: 60,
  headcount: 20,
  askRole: 80,
  shiftTypeKey: 48,
} as const;

/**
 * Nine or more digits in a row, allowing the spaces, dots, dashes and brackets
 * people type between them: a phone number. A card is pinned up for anyone to
 * read, so it names a role to ask, never a number.
 */
const PHONE = /(?:\+?\d[\s().-]*){9,}/;

export function containsPhoneNumber(text: string): boolean {
  return PHONE.test(text);
}

export const DUTY_CARD_NO_PHONE =
  "A duty card is pinned up for anyone to read: name a role to ask, never a phone number.";

const line = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Leave no ${what} empty.`)
    .max(
      DUTY_CARD_MAX.line,
      `Keep each ${what} under ${DUTY_CARD_MAX.line} characters.`,
    );

/**
 * The typed key a card once used to name its shift (like morning-clean).
 * Replaced by a real link: each shift type picks its duty card in its set-up
 * (`shift_types.duty_card_id`), and migration 0094 linked the keys that
 * matched a shift's name exactly. Kept, optional, so a key already on a card
 * stays readable; the editor no longer asks for one.
 */
export const DutyCardShiftKey = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    "Name the shift type in lowercase words joined by hyphens, like morning-clean.",
  )
  .max(DUTY_CARD_MAX.shiftTypeKey);

export const DutyCardSubRole = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name each sub-role.")
      .max(DUTY_CARD_MAX.name),
    min: z
      .number()
      .int()
      .min(1, "Each sub-role needs at least 1 person.")
      .max(DUTY_CARD_MAX.headcount),
    max: z.number().int().min(1).max(DUTY_CARD_MAX.headcount),
  })
  .refine((r) => r.max >= r.min, {
    message: "A sub-role's most people can't be fewer than its fewest.",
    path: ["max"],
  });
export type DutyCardSubRole = z.infer<typeof DutyCardSubRole>;

/**
 * A duty card that may be published: every part filled in and in bounds, and
 * no phone number anywhere on it.
 */
export const DutyCard = z
  .object({
    shiftTypeKey: z.union([z.literal(""), DutyCardShiftKey]).optional(),
    subRoles: z
      .array(DutyCardSubRole)
      .min(1, "Add at least one sub-role.")
      .max(DUTY_CARD_MAX.subRoles),
    steps: z
      .array(line("step"))
      .min(1, "Add at least one step.")
      .max(DUTY_CARD_MAX.steps),
    hardRules: z.array(line("hard rule")).max(DUTY_CARD_MAX.hardRules),
    checklist: z.array(line("checklist line")).max(DUTY_CARD_MAX.checklist),
    askRole: z
      .string()
      .trim()
      .min(1, "Say who to ask, as a role.")
      .max(DUTY_CARD_MAX.askRole),
  })
  .superRefine((card, ctx) => {
    const texts = [
      card.askRole,
      ...card.subRoles.map((r) => r.name),
      ...card.steps,
      ...card.hardRules,
      ...card.checklist,
    ];
    if (texts.some(containsPhoneNumber)) {
      ctx.addIssue({ code: "custom", message: DUTY_CARD_NO_PHONE });
    }
  });
export type DutyCard = z.infer<typeof DutyCard>;

/**
 * A duty card being written: the same parts, any of them still empty. Only
 * the bounds hold, so a half-written card saves as a draft and is checked in
 * full (DutyCard) when it is published.
 */
export const DutyCardDraft = z.object({
  shiftTypeKey: z.string().trim().max(DUTY_CARD_MAX.shiftTypeKey).optional(),
  subRoles: z
    .array(
      z.object({
        name: z.string().trim().max(DUTY_CARD_MAX.name),
        min: z.number().int().min(0).max(DUTY_CARD_MAX.headcount),
        max: z.number().int().min(0).max(DUTY_CARD_MAX.headcount),
      }),
    )
    .max(DUTY_CARD_MAX.subRoles),
  steps: z
    .array(z.string().trim().max(DUTY_CARD_MAX.line))
    .max(DUTY_CARD_MAX.steps),
  hardRules: z
    .array(z.string().trim().max(DUTY_CARD_MAX.line))
    .max(DUTY_CARD_MAX.hardRules),
  checklist: z
    .array(z.string().trim().max(DUTY_CARD_MAX.line))
    .max(DUTY_CARD_MAX.checklist),
  askRole: z.string().trim().max(DUTY_CARD_MAX.askRole),
});
export type DutyCardDraft = z.infer<typeof DutyCardDraft>;

export const EMPTY_DUTY_CARD: DutyCardDraft = {
  subRoles: [],
  steps: [],
  hardRules: [],
  checklist: [],
  askRole: "",
};

// --- What the editor sends ----------------------------------------------------

const ChapterFields = {
  title: Title,
  category: GuideCategory,
  team: Team.nullable(),
  markdown: Markdown,
  card: DutyCardDraft.nullable(),
};

export const NewGuideChapterInput = z
  .object({ kind: GuideChapterKind, ...ChapterFields })
  .refine((c) => (c.kind === "duty_card") === (c.card !== null), {
    message: "A duty card needs its card; a chapter has none.",
    path: ["card"],
  });
export type NewGuideChapterInput = z.infer<typeof NewGuideChapterInput>;

export const SaveGuideChapterInput = z.object({
  slug: GuideSlug,
  expectedVersion: z.number().int().min(1),
  ...ChapterFields,
  // Left out, the chapter keeps the topic it has: one the Claude connector
  // wrote as free text is not one of these, and a save must not move it.
  category: GuideCategory.optional(),
});
export type SaveGuideChapterInput = z.infer<typeof SaveGuideChapterInput>;

export const GuideChapterRef = z.object({
  slug: GuideSlug,
  expectedVersion: z.number().int().min(1),
});
export type GuideChapterRef = z.infer<typeof GuideChapterRef>;

/** A captain keeps a whole chapter off the public site, or lets it go out. */
export const SetGuideChapterMembersOnlyInput = z.object({
  slug: GuideSlug,
  membersOnly: z.boolean(),
});
export type SetGuideChapterMembersOnlyInput = z.infer<
  typeof SetGuideChapterMembersOnlyInput
>;

/** A captain puts a whole section (topic) on the public site, or takes it off. */
export const SetGuideSectionPublicInput = z.object({
  category: GuideCategory,
  public: z.boolean(),
});
export type SetGuideSectionPublicInput = z.infer<
  typeof SetGuideSectionPublicInput
>;

/** The public site's address (owner, 2026-10-04: with the hyphen). */
export const GUIDE_SITE_HOST = "survival-guide.camp-404.com";
export const GUIDE_SITE_URL = `https://${GUIDE_SITE_HOST}`;
