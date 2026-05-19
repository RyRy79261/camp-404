import "server-only";

import { cookies } from "next/headers";
import type { CurrentServerUser } from "@stackframe/stack";
import {
  createUserFromStack,
  findUserByStackId,
  getBurnerProfileByUserId,
  setUserInviteCode,
} from "@camp404/db/burner-profile";
import {
  INVITE_COOKIE,
  isGodEmail,
  isValidInviteCode,
} from "./access-control";

/**
 * Ensure a row exists in our `users` table for the given Stack user and
 * return it. Lazily upserts on first authenticated request rather than
 * relying on a Stack webhook.
 *
 * Also handles invite-code persistence:
 *   - If the user's email is in GOD_EMAILS, inviteCode stays NULL (god account).
 *   - Otherwise, if a valid `camp404_invite` cookie is present, we record
 *     the code on the user row and clear the cookie.
 *   - If neither applies on a brand-new account, the row is created with
 *     inviteCode = null and the caller is expected to gate them via
 *     `hasCampAccess()`.
 */
export async function ensureCampUser(stackUser: CurrentServerUser) {
  const email = stackUser.primaryEmail ?? null;
  const god = isGodEmail(email);
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(INVITE_COOKIE)?.value ?? null;
  const cookieCode =
    cookieValue && isValidInviteCode(cookieValue) ? cookieValue : null;

  const existing = await findUserByStackId(stackUser.id);
  if (existing) {
    if (!existing.inviteCode && cookieCode && !god) {
      await setUserInviteCode(existing.id, cookieCode);
      cookieStore.delete(INVITE_COOKIE);
      return { ...existing, inviteCode: cookieCode };
    }
    if (cookieCode) cookieStore.delete(INVITE_COOKIE);
    return existing;
  }

  const created = await createUserFromStack({
    stackUserId: stackUser.id,
    displayName: stackUser.displayName ?? email,
    inviteCode: god ? null : cookieCode,
  });
  if (cookieCode) cookieStore.delete(INVITE_COOKIE);
  return created;
}

export async function getBurnerProfile(campUserId: string) {
  return getBurnerProfileByUserId(campUserId);
}

/**
 * Whether this user is allowed past the signup gate (god account or has
 * redeemed a valid invite code).
 */
export function hasCampAccess(
  user: { inviteCode: string | null },
  email: string | null,
): boolean {
  return isGodEmail(email) || !!user.inviteCode;
}
