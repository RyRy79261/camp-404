import "server-only";

import { errorLogText } from "@camp404/core";
import { cache } from "react";
import { cookies } from "next/headers";
import * as db from "@camp404/db/desktop-layouts";
import {
  defaultDesktopPreferences,
  type DesktopPreferences,
} from "@camp404/types";
import { resolveMemberState } from "./member-gate";
import { isE2ETestMode, TEST_USER_COOKIE } from "./test-mode";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The member's 404 OS display preferences (issues #289 and #290): the theme,
// "Bigger text", "Effects off", "Open with one click", and whether they have
// closed the welcome wizard. On the server, beside their desktop layout, so a
// choice follows them to a new device. The console layout reads them with
// the manifest and writes the theme on the desktop root, so the first paint
// is already in it. Written through app/(console)/desktop-preferences-actions.ts.
// From the database or, under E2E, the test store, picked once (twin);
// lib/__tests__/desktop-agreement.test.ts holds the two sides equal.

const prefs = twin(db, testStore, [
  "getDesktopPreferences",
  "saveDesktopPreferences",
  "markWelcomeSeen",
]);

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
      return await prefs.getDesktopPreferences(userId);
    } catch (err) {
      // Never a reason for the desktop not to draw: the default look.
      console.error(
        "[desktop-preferences] read failed; the defaults",
        errorLogText(err, process.env),
      );
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
    const mine = await readPreferences(state.campUser.id);
    if (
      isE2ETestMode() &&
      mine.welcomeSeenAt === null &&
      !(await e2eWantsWelcome())
    ) {
      return { ...mine, welcomeSeenAt: E2E_WELCOME_SEEN_AT };
    }
    return mine;
  },
);

/**
 * Change some of a member's own choices. The caller passes the signed-in
 * member's own id, never one from the client. Throws
 * `DesktopPreferencesInvalidError` for anything but a change of theme, the
 * switches or one click.
 */
export const saveDesktopPreferencesFor = prefs.saveDesktopPreferences;

/** The member closed the welcome wizard: it does not open by itself again. */
export const markWelcomeSeenFor = prefs.markWelcomeSeen;
