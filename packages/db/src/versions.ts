// Compare versioned questionnaire / catalogue strings of the form
// "<base>-v<N>" (e.g. "2026.05.29-v8"). Plain string comparison mis-orders
// "...-v9" vs "...-v10" (lexicographically '9' > '1'), so the numeric suffix
// must be compared as an integer.

const VERSION_RE = /^(.*)-v(\d+)$/;

/**
 * Whether `completed` satisfies `required` (i.e. `completed >= required`). When
 * both share the same base and a numeric `-vN` suffix, the suffix is compared
 * as an integer; otherwise it falls back to lexicographic comparison (safe for
 * the date-prefixed base, which sorts correctly as a string).
 */
export function meetsRequiredVersion(
  required: string,
  completed: string,
): boolean {
  const r = VERSION_RE.exec(required);
  const c = VERSION_RE.exec(completed);
  if (r && c && r[1] === c[1]) {
    return Number(c[2]) >= Number(r[2]);
  }
  return completed >= required;
}
