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

/**
 * Mint the next published version for a BUILDER questionnaire. Builder versions
 * are `<key>-v<N>`: a fixed base (the immutable definition key) plus a strictly
 * incrementing counter, so meetsRequiredVersion always compares them on the
 * numeric path — provably monotonic regardless of wall-clock. (The bespoke code
 * questionnaires use a date base `<YYYY.MM.DD>-vN`, which is human-readable but
 * relies on time only moving forward; publish versioning is automated, so it
 * uses the clock-independent scheme instead.)
 *
 * The first publish is `<key>-v1`; each BREAKING re-publish bumps N. Cosmetic
 * re-publishes keep the current version (the caller decides via classifyChange).
 * A non-conforming `latest` (legacy / corrupt) falls back to `<key>-v1`.
 */
export function nextBuilderVersion(key: string, latest: string | null): string {
  if (!latest) return `${key}-v1`;
  const match = /-v(\d+)$/.exec(latest);
  const n = match ? Number(match[1]) : 0;
  return `${key}-v${n + 1}`;
}
