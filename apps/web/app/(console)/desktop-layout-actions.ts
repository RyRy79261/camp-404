"use server";

import { DesktopLayout } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { saveDesktopLayoutFor } from "@/lib/desktop-layout";
import { resolveMemberState } from "@/lib/member-gate";
import { manifestModeFor } from "@/lib/program-manifest";

// The 404 OS desktop saves the member's layout here (owner's decision 14 B),
// debounced on the client: one write after the member stops moving icons, not
// one per drop. A "use server" file: async exports only.

/**
 * Save the signed-in member's desktop layout: icon cells, their shortcuts and
 * their folders. The member writes only their own row (the id comes from the
 * session, never the caller). A member's own layout is not privileged, so no
 * audit row. It refreshes nothing: the desktop already shows what it saved.
 *
 * Refused for a visitor with no desktop, and while a blocking questionnaire
 * holds the member (the desktop behind it is inert, so nothing should move).
 */
export async function saveDesktopLayoutAction(
  layout: unknown,
): Promise<ActionResult> {
  return runAction("saveDesktopLayoutAction", async () => {
    const state = await resolveMemberState();
    if (state.kind !== "member") {
      return { ok: false, error: "Sign in again to keep your desktop." };
    }
    const mode = manifestModeFor(state);
    if (mode === null || mode === "held") {
      return { ok: false, error: "Your desktop can't be changed right now." };
    }
    const parsed = DesktopLayout.safeParse(layout);
    if (!parsed.success) {
      return { ok: false, error: "Your desktop couldn't be saved." };
    }
    await saveDesktopLayoutFor(state.campUser.id, parsed.data);
    return { ok: true };
  });
}
