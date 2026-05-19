import "server-only";

// Name of the HttpOnly cookie that proves a user redeemed an invite code on
// `/signup` before being sent to Stack's sign-up UI. Read on the first
// authenticated request to copy the code onto the camp user row, then
// cleared.
export const INVITE_COOKIE = "camp404_invite";

// Cookie lifetime — long enough to survive the OAuth round trip and a
// distracted user finishing email verification, short enough that a stale
// cookie isn't useful indefinitely.
export const INVITE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2; // 2 hours

function csv(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns true if the given email address is in GOD_EMAILS (case-insensitive).
 * God accounts bypass the invite-code requirement.
 */
export function isGodEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = csv(process.env.GOD_EMAILS).map((e) => e.toLowerCase());
  return list.includes(email.toLowerCase());
}

/**
 * Returns true if the given code matches one of INVITE_CODES (exact, case-
 * sensitive). Empty / missing env = no codes are valid.
 */
export function isValidInviteCode(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  return csv(process.env.INVITE_CODES).includes(trimmed);
}
