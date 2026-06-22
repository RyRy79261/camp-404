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
