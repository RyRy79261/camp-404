"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import {
  moveTeam,
  renameTeam,
  setTeamArchived,
} from "@camp404/db/camp-config";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { mutateTeamsConfig } from "@/lib/camp-config";

// Captain-only team-settings mutations (Phase 2). Each does a captain-gate, a
// Zod boundary parse, then a locked read-modify-write via mutateTeamsConfig.
// Relabel/reorder/archive only — no add/remove of team keys (that's an enum
// migration, Phase 4) — and the writer asserts the key set stays stable.

export type TeamSettingsResult = { ok: true } | { ok: false; error: string };

// Thrown from inside the locked transform when an archive would leave zero
// active teams, so the invariant is checked against the freshly-locked config
// (not a stale pre-read) — a concurrent double-archive can't slip past it. The
// throw rolls the transaction back; the action catches it for a friendly error.
class LastActiveTeamError extends Error {}

const TeamKey = z.string().min(1);
const TeamLabel = z
  .string()
  .trim()
  .min(1, "A team needs a name.")
  .max(40, "Keep team names under 40 characters.");
const Direction = z.enum(["up", "down"]);

/**
 * Captain-gate a team-settings action. Returns ok, or a captain-facing error
 * string for the caller to surface — same preview-but-locked comparator (D3)
 * the captain pages gate on.
 */
async function requireCaptain(): Promise<TeamSettingsResult> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  // Mirror the page's gates: a captain still held behind vetting can't act.
  // Server actions are reachable independently of the page render, so the
  // approval check has to live here too — not just on the page (D3).
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account is still awaiting approval." };
  }
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );
  if (!cleared) return { ok: false, error: "Captain access only." };
  return { ok: true };
}

// Relabelling, reordering, or archiving a team changes the roster's team filter
// too, so revalidate both surfaces. (The onboarding questionnaire still reads
// its static list until Phase 3 — that drift is known and accepted for now.)
function revalidateTeamSurfaces(): void {
  revalidatePath("/captains/camp-settings");
  revalidatePath("/captains/camp-management");
}

export async function renameTeamAction(
  key: string,
  label: string,
): Promise<TeamSettingsResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  const parsedKey = TeamKey.safeParse(key);
  if (!parsedKey.success) return { ok: false, error: "Unknown team." };
  const parsedLabel = TeamLabel.safeParse(label);
  if (!parsedLabel.success) {
    return {
      ok: false,
      error: parsedLabel.error.issues[0]?.message ?? "Invalid team name.",
    };
  }
  await mutateTeamsConfig((config) =>
    renameTeam(config, parsedKey.data, parsedLabel.data),
  );
  revalidateTeamSurfaces();
  return { ok: true };
}

export async function moveTeamAction(
  key: string,
  direction: "up" | "down",
): Promise<TeamSettingsResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  const parsedKey = TeamKey.safeParse(key);
  const parsedDirection = Direction.safeParse(direction);
  if (!parsedKey.success || !parsedDirection.success) {
    return { ok: false, error: "Invalid move." };
  }
  await mutateTeamsConfig((config) =>
    moveTeam(config, parsedKey.data, parsedDirection.data),
  );
  revalidateTeamSurfaces();
  return { ok: true };
}

export async function setTeamArchivedAction(
  key: string,
  archived: boolean,
): Promise<TeamSettingsResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  const parsedKey = TeamKey.safeParse(key);
  const parsedArchived = z.boolean().safeParse(archived);
  if (!parsedKey.success || !parsedArchived.success) {
    return { ok: false, error: "Invalid request." };
  }

  // The roster (and, later, the questionnaire) needs at least one active team,
  // so refuse to archive the last one. Checked INSIDE the locked transform
  // against the freshly-locked config, so two captains archiving the final two
  // teams at once can't both slip through (the second's transform throws and
  // rolls back). Recoverable by unarchiving regardless.
  try {
    await mutateTeamsConfig((config) => {
      const next = setTeamArchived(config, parsedKey.data, parsedArchived.data);
      if (!next.teams.some((team) => !team.archived)) {
        throw new LastActiveTeamError();
      }
      return next;
    });
  } catch (error) {
    if (error instanceof LastActiveTeamError) {
      return { ok: false, error: "At least one team must stay active." };
    }
    throw error;
  }
  revalidateTeamSurfaces();
  return { ok: true };
}
