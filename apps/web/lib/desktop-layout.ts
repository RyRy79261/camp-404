import "server-only";

import { cache } from "react";
import {
  getDesktopLayout as dbGetDesktopLayout,
  saveDesktopLayout as dbSaveDesktopLayout,
} from "@camp404/db/desktop-layouts";
import {
  desktopFolderKey,
  desktopTeamFolderKey,
  emptyDesktopLayout,
  pruneDesktopLayout,
  type DesktopLayout,
  type DesktopLayoutAllowed,
} from "@camp404/types";
import { resolveMemberState } from "./member-gate";
import { getProgramManifest, manifestModeFor } from "./program-manifest";
import { manifestProgramIds, type ProgramManifest } from "./programs";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The member's 404 OS desktop layout (owner's decision 14 B: on the server,
// one row per member in `desktop_layouts`). The desktop reads it beside the
// manifest and draws it pruned against that manifest; the client writes it
// back through saveDesktopLayoutAction (app/(console)/desktop-layout-actions.ts),
// debounced. It holds program ids, grid cells and folder names only, and it is
// never authority: an id the manifest does not hold is dropped here, never
// drawn, and every page still runs its own gate.

/** What a member's manifest lets their saved layout name. Pure. */
export function desktopLayoutAllowed(
  manifest: ProgramManifest,
): DesktopLayoutAllowed {
  const programs = manifestProgramIds(manifest);
  // An archived team the member is still on has its page only in their team
  // folder, not in the Teams folder.
  for (const folder of manifest.teamFolders) {
    for (const program of folder.programs) programs.add(program.id);
  }
  return {
    icons: [
      ...manifest.programs.map((program) => program.id),
      ...manifest.folders.map((folder) => desktopFolderKey(folder.id)),
      ...manifest.teamFolders.map((folder) =>
        desktopTeamFolderKey(folder.team),
      ),
    ],
    programs,
  };
}

/**
 * The member's saved layout as stored (checked, not pruned), or null for
 * none. A failed read is logged and reads as none: the layout is never a
 * reason for the desktop not to draw.
 */
const readSavedLayout = cache(
  async (userId: string): Promise<DesktopLayout | null> => {
    try {
      if (usesTestStore()) return testStore.getDesktopLayout(userId);
      return await dbGetDesktopLayout(userId);
    } catch (err) {
      console.error("[desktop-layout] read failed; drawing the default", err);
      return null;
    }
  },
);

/**
 * The signed-in member's desktop layout for this request, pruned against
 * their manifest, or null when they get no desktop (signed out, the invite
 * and onboarding gates, a rejected applicant). An empty layout (no cells, no
 * items) means the default layout: every icon in its default cell. So does a
 * stored value that is not a layout.
 *
 * Read beside the manifest, in parallel with its reads. React `cache()` only,
 * never `unstable_cache` or `"use cache"`: it is keyed by viewer.
 */
export const getMyDesktopLayout = cache(
  async (): Promise<DesktopLayout | null> => {
    const state = await resolveMemberState();
    if (state.kind !== "member" || manifestModeFor(state) === null) {
      return null;
    }
    const [manifest, saved] = await Promise.all([
      getProgramManifest(),
      readSavedLayout(state.campUser.id),
    ]);
    if (!manifest) return null;
    return pruneDesktopLayout(
      saved ?? emptyDesktopLayout(),
      desktopLayoutAllowed(manifest),
    );
  },
);

/**
 * Save a member's layout, replacing the one before. The caller passes the
 * signed-in member's own id, never one from the client. Throws
 * `DesktopLayoutInvalidError` for a value that is not a layout.
 */
export async function saveDesktopLayoutFor(
  userId: string,
  layout: unknown,
): Promise<DesktopLayout> {
  if (usesTestStore()) return testStore.saveDesktopLayout(userId, layout);
  return dbSaveDesktopLayout(userId, layout);
}
