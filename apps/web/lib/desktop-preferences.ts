import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  getDesktopPreferences as dbGetDesktopPreferences,
  markWelcomeSeen as dbMarkWelcomeSeen,
  saveDesktopPreferences as dbSaveDesktopPreferences,
} from "@camp404/db/desktop-layouts";
import {
  defaultDesktopPreferences,
  type DesktopPreferences,
} from "@camp404/types";
import { resolveMemberState } from "./member-gate";
import { isE2ETestMode, TEST_USER_COOKIE, usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The member's 404 OS display preferences (issues #289 and #290): the theme,
// "Bigger text", "Effects off", "Open with one click", and whether they have
// closed the welcome wizard. On the server, beside their desktop layout, so a
// choice follows them to a new device. The console layout reads them with
// the manifest and writes the theme on the desktop root, so the first paint
// is already in it. Written through app/(console)/desktop-preferences-actions.ts.

/**
 * A stand-in for "seen" in the E2E harness. Every spec signs a fresh member
 * in, and the wizard would sit over the right of every desktop they drive; a
 * spec that is about the wizard signs in with `welcome: true`
 * (/api/test/login) and gets the real behaviour. Production never sets
 * E2E_TEST_MODE, so this is never read there.
 */
export const E2E_WELCOME_SEEN_AT = "2000-01-01T00:00:00.000Z";

/** Whether the E2E login asked for the welcome wizard (`welcome: true`). */
async function e2eWantsWelcome(): Promise<boolean> {
  const raw = (await cookies()).get(TEST_USER_COOKIE)?.value;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as {
      welcome?: unknown;
    };
    return parsed.welcome === true;
  } catch {
    return false;
  }
}

/** The stored preferences, or the defaults when the read fails. */
const readPreferences = cache(
  async (userId: string): Promise<DesktopPreferences> => {
    try {
      if (usesTestStore()) return testStore.getDesktopPreferences(userId);
      return await dbGetDesktopPreferences(userId);
    } catch (err) {
      // Never a reason for the desktop not to draw: the default look.
      console.error("[desktop-preferences] read failed; the defaults", err);
      return defaultDesktopPreferences();
    }
  },
);

/**
 * The signed-in member's preferences for this request; the defaults for
 * anyone signed out. React `cache()` only: keyed by viewer.
 */
export const getMyDesktopPreferences = cache(
  async (): Promise<DesktopPreferences> => {
    const state = await resolveMemberState();
    if (state.kind !== "member") return defaultDesktopPreferences();
    const prefs = await readPreferences(state.campUser.id);
    if (
      isE2ETestMode() &&
      prefs.welcomeSeenAt === null &&
      !(await e2eWantsWelcome())
    ) {
      return { ...prefs, welcomeSeenAt: E2E_WELCOME_SEEN_AT };
    }
    return prefs;
  },
);

/**
 * Change some of a member's own choices. The caller passes the signed-in
 * member's own id, never one from the client. Throws
 * `DesktopPreferencesInvalidError` for anything but a change of theme, the
 * switches or one click.
 */
export async function saveDesktopPreferencesFor(
  userId: string,
  patch: unknown,
): Promise<DesktopPreferences> {
  if (usesTestStore()) return testStore.saveDesktopPreferences(userId, patch);
  return dbSaveDesktopPreferences(userId, patch);
}

/** The member closed the welcome wizard: it does not open by itself again. */
export async function markWelcomeSeenFor(
  userId: string,
): Promise<DesktopPreferences> {
  if (usesTestStore()) return testStore.markWelcomeSeen(userId);
  return dbMarkWelcomeSeen(userId);
}
