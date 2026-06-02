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
