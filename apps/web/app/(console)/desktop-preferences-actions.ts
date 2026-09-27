"use server";

import { DesktopPreferencesPatch } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  markWelcomeSeenFor,
  saveDesktopPreferencesFor,
} from "@/lib/desktop-preferences";
import { resolveMemberState } from "@/lib/member-gate";
import { manifestModeFor } from "@/lib/program-manifest";

// The member's 404 OS display preferences (issues #289 and #290): the theme,
// the two switches, one click, and the welcome wizard closed. Each is the
// member's own row (the id comes from the session, never the caller) and
// not privileged, so no audit row. They refresh nothing: the desktop already
// shows what was chosen. A "use server" file: async exports only.

/** Who may change their display: a member with a desktop, not held. */
async function desktopMember(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const state = await resolveMemberState();
  if (state.kind !== "member") {
    return { ok: false, error: "Sign in again to keep your display settings." };
  }
  const mode = manifestModeFor(state);
  if (mode === null || mode === "held") {
    return { ok: false, error: "Your display can't be changed right now." };
  }
  return { ok: true, userId: state.campUser.id };
}

/**
 * Change the member's theme, "Bigger text", "Effects off" or "Open with one
 * click" (any of them, at least one). Anything else is refused.
 */
export async function saveDesktopPreferencesAction(
  patch: unknown,
): Promise<ActionResult> {
  return runAction("saveDesktopPreferencesAction", async () => {
    const who = await desktopMember();
    if (!who.ok) return who;
    const parsed = DesktopPreferencesPatch.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: "That display setting couldn't be saved." };
    }
    await saveDesktopPreferencesFor(who.userId, parsed.data);
    return { ok: true };
  });
}

/**
 * The member closed the welcome wizard (Done, Skip for now, Esc or ×): it
 * does not open by itself again, on this device or another. Start > Welcome
 * still opens it.
 */
export async function markWelcomeSeenAction(): Promise<ActionResult> {
  return runAction("markWelcomeSeenAction", async () => {
    const who = await desktopMember();
    if (!who.ok) return who;
    await markWelcomeSeenFor(who.userId);
    return { ok: true };
  });
}
