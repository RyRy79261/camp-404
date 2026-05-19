import "server-only";

import type { CurrentServerUser } from "@stackframe/stack";
import {
  createUserFromStack,
  findUserByStackId,
  getBurnerProfileByUserId,
} from "@camp404/db/burner-profile";

/**
 * Ensure a row exists in our `users` table for the given Stack user and
 * return it. We do this lazily on first authenticated request rather than
 * relying on a Stack webhook — Stack is the source of truth for identity,
 * this row just stores camp-specific profile data keyed by `stackUserId`.
 */
export async function ensureCampUser(stackUser: CurrentServerUser) {
  const existing = await findUserByStackId(stackUser.id);
  if (existing) return existing;
  return createUserFromStack({
    stackUserId: stackUser.id,
    displayName: stackUser.displayName ?? stackUser.primaryEmail ?? null,
  });
}

export async function getBurnerProfile(campUserId: string) {
  return getBurnerProfileByUserId(campUserId);
}
