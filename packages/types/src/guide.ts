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

const Markdown = z
  .string()
  .max(GUIDE_MARKDOWN_MAX, "The chapter is too long. Split it in two.");

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

const NO_PHONE =
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

/** A shift type's key, as the shift roster will name it (#248). */
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
    shiftTypeKey: DutyCardShiftKey,
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
      ctx.addIssue({ code: "custom", message: NO_PHONE });
    }
  });
export type DutyCard = z.infer<typeof DutyCard>;

/**
 * A duty card being written: the same parts, any of them still empty. Only
 * the bounds hold, so a half-written card saves as a draft and is checked in
 * full (DutyCard) when it is published.
 */
export const DutyCardDraft = z.object({
  shiftTypeKey: z.string().trim().max(DUTY_CARD_MAX.shiftTypeKey),
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
  shiftTypeKey: "",
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
});
export type SaveGuideChapterInput = z.infer<typeof SaveGuideChapterInput>;

export const GuideChapterRef = z.object({
  slug: GuideSlug,
  expectedVersion: z.number().int().min(1),
});
export type GuideChapterRef = z.infer<typeof GuideChapterRef>;

export const SetGuideChapterPublicInput = z.object({
  slug: GuideSlug,
  public: z.boolean(),
});
export type SetGuideChapterPublicInput = z.infer<
  typeof SetGuideChapterPublicInput
>;
