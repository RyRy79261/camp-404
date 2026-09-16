// Tiny string helpers shared across surfaces. Pure (framework-agnostic) so
// apps/web and other packages can derive the same display strings without
// duplicating the rules.

/**
 * Derive up to two uppercase initials from a name or email. Splits on
 * whitespace, "@", and ".". Returns "?" when there's nothing usable.
 * Shared by the home header avatar and the profile page.
 */
export function initialsFrom(source: string | null): string {
  if (!source) return "?";
  const parts = source
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A URL/identifier-safe slug from arbitrary text: lowercased, diacritics
 * stripped, runs of non-alphanumerics collapsed to single hyphens, trimmed and
 * length-capped. Returns "" when nothing usable is left (callers supply their
 * own fallback base). Used to seed stable questionnaire keys from a title.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/**
 * Humanise a snake_case enum key for display: "art_and_activities" →
 * "Art and Activities". Connectives ("and", "of") stay lowercase unless they
 * lead. The LAST-RESORT rendering of a stored key — a configured label always
 * wins (see `audienceLabel` / `teamLabelMap` in @camp404/db/camp-config) — but
 * it lives here, beside the other display-string rules, because both the
 * client-side roster chips and the server-side audience vocabulary need the
 * same fallback and neither may own it alone.
 */
export function humanizeKey(key: string): string {
  return key
    .split("_")
    .map((word, index) =>
      index > 0 && (word === "and" || word === "of")
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
