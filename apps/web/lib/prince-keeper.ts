import "server-only";

import type { AuthenticatedUser } from "./auth";
import { envList, type EnvBag } from "./integration-config";

// Who sees Prince come home (owner, 2026-09-26): Prince, the white cat asleep
// on the taskbar clock, was a captain's cat. For her, he is not asleep on the
// clock; she walks up and calls him, and he runs home to her lap
// (@camp404/games/characters, prince-reunion.md). Everyone else keeps him
// asleep on the clock.
//
// Her address is in PRINCE_KEEPER_EMAILS (a comma list, trimmed, any case),
// read here on the server only. The desktop is handed one boolean; the list
// itself never reaches a browser, and is scrubbed from logs (SECRET_ENV_KEYS).

/** The addresses that see the reunion, lower-cased. */
export function princeKeeperEmails(env: EnvBag): string[] {
  return envList(env.PRINCE_KEEPER_EMAILS).map((e) => e.toLowerCase());
}

/**
 * Whether this signed-in member sees Prince come home: their address is on
 * the list AND the auth server has proven they own it. An unconfirmed
 * account (sign-up is open) could hold anyone's address.
 */
export function isPrinceKeeper(
  env: EnvBag,
  user: Pick<AuthenticatedUser, "primaryEmail" | "emailVerified"> | null,
): boolean {
  if (!user?.emailVerified || !user.primaryEmail) return false;
  const email = user.primaryEmail.trim().toLowerCase();
  return email !== "" && princeKeeperEmails(env).includes(email);
}
