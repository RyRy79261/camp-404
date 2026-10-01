import { slugify } from "@camp404/core";
import {
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_LABELS,
  GUIDE_SLUG_MAX,
  GuideCategory,
  GuideSlug,
  RESERVED_GUIDE_SLUGS,
} from "@camp404/types";

// What the Survival Guide's pages say and where they link (#250). Pure, so
// the pages, the editor and the tests share one set of words.

export const GUIDE_PATH = "/guide";
export const NEW_GUIDE_CHAPTER_PATH = "/guide/new";

export function guideChapterPath(slug: string): string {
  return `${GUIDE_PATH}/${encodeURIComponent(slug)}`;
}

export function guideEditPath(slug: string): string {
  return `${guideChapterPath(slug)}/edit`;
}

export function guideVersionPath(slug: string, version: number): string {
  return `${guideChapterPath(slug)}/versions/${version}`;
}

/** A topic's name; a topic written by the Claude connector shows as typed. */
export function guideCategoryLabel(category: string): string {
  const known = GuideCategory.safeParse(category);
  return known.success ? GUIDE_CATEGORY_LABELS[known.data] : category;
}

/**
 * The Topic select's choices: the guide's own topics, and a chapter's current
 * topic too when the Claude connector wrote it as free text, so opening and
 * saving the chapter keeps it.
 */
export function guideTopicOptions(
  current: string,
): { value: string; label: string }[] {
  const options = GUIDE_CATEGORIES.map((c) => ({
    value: c as string,
    label: GUIDE_CATEGORY_LABELS[c],
  }));
  if (!GuideCategory.safeParse(current).success && current !== "") {
    options.push({ value: current, label: current });
  }
  return options;
}

/**
 * The topic a save sends: one of the guide's own, or nothing, which keeps the
 * chapter's free-text topic as it is.
 */
export function guideTopicToSave(topic: string): GuideCategory | undefined {
  const known = GuideCategory.safeParse(topic);
  return known.success ? known.data : undefined;
}

export const WHOLE_CAMP_LABEL = "Whole camp";

export const KIND_LABEL = { chapter: "Chapter", duty_card: "Duty card" };

export const MARK_LABEL = { new: "New", updated: "Updated" } as const;

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

/** "4 Oct 2026", in camp time. */
export function guideDay(at: Date): string {
  return DAY.format(at);
}

export interface GuideGroup<T> {
  key: string;
  label: string;
  chapters: T[];
}

/**
 * Chapters by topic, in the guide's reading order; a topic nobody wrote under
 * is left out, and topics the guide does not know come last.
 */
export function groupByTopic<T extends { category: string }>(
  chapters: readonly T[],
): GuideGroup<T>[] {
  const known: string[] = [...GUIDE_CATEGORIES];
  const extra = [
    ...new Set(
      chapters.map((c) => c.category).filter((c) => !known.includes(c)),
    ),
  ].sort();
  return [...known, ...extra]
    .map((key) => ({
      key,
      label: guideCategoryLabel(key),
      chapters: chapters.filter((c) => c.category === key),
    }))
    .filter((g) => g.chapters.length > 0);
}

/**
 * Chapters by team, in the camp's team order, the whole camp's first. A team
 * with no chapters is left out.
 */
export function groupByTeam<T extends { team: string | null }>(
  chapters: readonly T[],
  teams: readonly { key: string; label: string }[],
): GuideGroup<T>[] {
  const groups: GuideGroup<T>[] = [
    {
      key: "camp",
      label: WHOLE_CAMP_LABEL,
      chapters: chapters.filter((c) => c.team === null),
    },
    ...teams.map((t) => ({
      key: t.key,
      label: t.label,
      chapters: chapters.filter((c) => c.team === t.key),
    })),
  ];
  const named = new Set(teams.map((t) => t.key));
  for (const c of chapters) {
    if (c.team !== null && !named.has(c.team)) {
      named.add(c.team);
      groups.push({
        key: c.team,
        label: c.team,
        chapters: chapters.filter((x) => x.team === c.team),
      });
    }
  }
  return groups.filter((g) => g.chapters.length > 0);
}

/**
 * A chapter's address from its title, cut at a whole word so it fits
 * GUIDE_SLUG_MAX (slugify alone cuts mid-word). The address is permanent, so
 * it should read well. A reserved or empty slug gets `suffix` added (a short
 * random tail from the caller), still within the limit.
 */
export function guideSlugFor(title: string, suffix: string): string {
  let slug = "";
  for (const word of title.split(/\s+/).map(slugify).filter(Boolean)) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > GUIDE_SLUG_MAX) break;
    slug = next;
  }
  // A first word longer than the limit: fall back to slugify's own cut.
  if (slug === "") slug = slugify(title);
  if (slug === "" || RESERVED_GUIDE_SLUGS.has(slug)) {
    const tail = `-${suffix}`;
    const base = (slug || "chapter")
      .slice(0, GUIDE_SLUG_MAX - tail.length)
      .replace(/-+$/g, "");
    return `${base}${tail}`;
  }
  return GuideSlug.safeParse(slug).success ? slug : `chapter-${suffix}`;
}
