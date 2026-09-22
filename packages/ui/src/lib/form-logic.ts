// Pure form helpers the kit's inputs share. No React, no "use client" — so a
// server component and a test can both read them without pulling in a tree.
//
// Ported from the AfrikaBurn contributors app's packages/ui/src/lib/form-logic.ts
// (the password half; its textarea word count has no Camp 404 caller — the
// character count lives in textarea-with-count.tsx).

/**
 * The minimum a new Camp 404 password may be.
 *
 * AfrikaBurn's number, and AfrikaBurn's reasoning: one long passphrase, no
 * composition rules, paste allowed. It is enforced where Camp 404 actually
 * chooses a password — the sign-up form — so the meter's "use at least N
 * characters" is a rule the app keeps, not advice it ignores. Sign-in does
 * not apply it: an account made before this exists and must still get in.
 */
export const PASSWORD_MIN_LENGTH = 15;

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** Raw character length. */
  length: number;
  /** Whether the password clears the single-factor minimum. */
  meetsMin: boolean;
  /** Coarse strength bucket, 0 (empty) … 4 (strong). Length-based ONLY. */
  score: PasswordStrengthScore;
  /** Human label for the current bucket ("" when empty). */
  label: string;
  /** Bar fill 0–100, for the strength meter. */
  percent: number;
}

// Length past which the meter is considered full, for the % calculation.
const STRENGTH_FULL_AT = 32;

/**
 * Length-based password strength — no composition rules by design. Below the
 * minimum reads as "Too short"; above it strengthens with length only.
 */
export function passwordStrength(
  password: string,
  min: number = PASSWORD_MIN_LENGTH,
): PasswordStrength {
  const length = password.length;
  const percent = Math.round(
    (Math.min(length, STRENGTH_FULL_AT) / STRENGTH_FULL_AT) * 100,
  );

  if (length === 0) {
    return { length, meetsMin: false, score: 0, label: "", percent: 0 };
  }
  if (length < min) {
    return { length, meetsMin: false, score: 1, label: "Too short", percent };
  }
  if (length < 20) {
    return { length, meetsMin: true, score: 2, label: "Fair", percent };
  }
  if (length < 30) {
    return { length, meetsMin: true, score: 3, label: "Good", percent };
  }
  return { length, meetsMin: true, score: 4, label: "Strong", percent };
}
