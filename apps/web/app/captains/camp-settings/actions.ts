"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import {
  moveTeam,
  renameTeam,
  setTeamArchived,
  TeamNameConflictError,
  MAX_CYCLE_YEAR,
  MIN_CYCLE_YEAR,
} from "@camp404/db/camp-config";
import {
  advanceCycle,
  setFoundingYear,
  type FoundingReport,
  type RolloverReport,
} from "@camp404/db/cycle-rollover";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { mutateTeamsConfig } from "@/lib/camp-config";

// Captain-only team-settings mutations (Phase 2). Each does a captain-gate, a
// Zod boundary parse, then a locked read-modify-write via mutateTeamsConfig.
// Relabel/reorder/archive only — no add/remove of team keys (that's an enum
// migration, Phase 4) — and the writer asserts the key set stays stable.

export type TeamSettingsResult = { ok: true } | { ok: false; error: string };

// A camp must keep at least TWO active teams: the roster filter needs one, and
// the onboarding "team lead of…" multi-select (Phase 3) requires ≥2 options
// (the questionnaire schema's multi_select minimum). Thrown from inside the
// locked transform so the check runs against the freshly-locked config (not a
// stale pre-read) — a concurrent double-archive can't slip past it. The throw
// rolls the transaction back; the action catches it for a friendly error.
const MIN_ACTIVE_TEAMS = 2;
class TooFewActiveTeamsError extends Error {}

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
  // The lead flag is hardcoded `false` on purpose. This bar is `captain`
  // and `team_lead < captain`, so the real flag cannot change the outcome —
  // passing it would only buy a DB round-trip. If this bar ever drops to
  // `team_lead`, it MUST become `await isTeamLead(campUser.id)`.
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );
  if (!cleared) return { ok: false, error: "Captain access only." };
  return { ok: true };
}

// Relabelling, reordering, or archiving a team changes every surface that reads
// team config: the settings page, the roster (filter + chips), and — since
// Phase 3 — the onboarding questionnaire + the burner-profile replay form.
function revalidateTeamSurfaces(): void {
  revalidatePath("/captains/camp-settings");
  revalidatePath("/captains/camp-management");
  revalidatePath("/onboarding/questionnaire");
  revalidatePath("/tools/forms/burner_profile");
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
  // renameTeam refuses a name another team already answers to (case- and
  // accent-insensitively) by throwing from INSIDE the locked transform, so the
  // comparison runs against the freshly-locked config — two captains renaming
  // two teams to the same thing at once cannot both win, and the loser's
  // transaction rolls back rather than leaving the roster filter ambiguous.
  try {
    await mutateTeamsConfig((config) =>
      renameTeam(config, parsedKey.data, parsedLabel.data),
    );
  } catch (error) {
    if (error instanceof TeamNameConflictError) {
      return {
        ok: false,
        error: `Another team is already called “${parsedLabel.data}”. Pick a different name.`,
      };
    }
    throw error;
  }
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

  // Refuse to archive below MIN_ACTIVE_TEAMS. Checked INSIDE the locked
  // transform against the freshly-locked config, so concurrent archives can't
  // both slip through (the one that would breach throws and rolls back).
  // Recoverable by unarchiving regardless.
  try {
    await mutateTeamsConfig((config) => {
      const next = setTeamArchived(config, parsedKey.data, parsedArchived.data);
      const active = next.teams.filter((team) => !team.archived).length;
      if (active < MIN_ACTIVE_TEAMS) {
        throw new TooFewActiveTeamsError();
      }
      return next;
    });
  } catch (error) {
    if (error instanceof TooFewActiveTeamsError) {
      return { ok: false, error: "At least two teams must stay active." };
    }
    throw error;
  }
  revalidateTeamSurfaces();
  return { ok: true };
}

// --- The year (the founding year + the rollover, spec §8) -------------------
// The camp-facing half lives in @camp404/db/cycle-rollover: planRollover() is a
// pure read the page calls directly; setFoundingYear() and advanceCycle() are
// each one pooled transaction. These actions are the captain gate, the boundary
// parse, and the type-to-confirm check — deliberately thin, because the
// interesting refusals (already advanced, already founded) belong to the
// transaction that holds the lock.
//
// A year is a number, not a name: one integer both identifies the year a
// captain reads and namespaces every row stamped with it.

export type AdvanceCycleActionResult =
  | { ok: true; report: RolloverReport }
  | { ok: false; error: string };

export type SetFoundingYearActionResult =
  | { ok: true; report: FoundingReport }
  | { ok: false; error: string };

// Coerced rather than z.number() so a form value arrives the same way whether
// the caller sent the number or the string the input holds.
const CycleYear = z.coerce
  .number()
  .int("A year is a whole number.")
  .min(MIN_CYCLE_YEAR, `A year has to be ${MIN_CYCLE_YEAR} or later.`)
  .max(MAX_CYCLE_YEAR, `A year has to be ${MAX_CYCLE_YEAR} or earlier.`);

const SetFoundingYearForm = z.object({ year: CycleYear });

const AdvanceCycleForm = z
  .object({
    year: CycleYear,
    /** The same number typed a second time — the type-the-name pattern. */
    confirm: CycleYear,
    resetDues: z.boolean().optional(),
    announcement: z
      .object({
        title: z
          .string()
          .trim()
          .min(1, "Give the announcement a title.")
          .max(120, "Keep the announcement title under 120 characters."),
        body: z
          .string()
          .trim()
          .min(1, "Write something for the announcement.")
          .max(2000, "Keep the announcement under 2000 characters."),
      })
      .nullish(),
  })
  // Re-checked here and not only in the browser: a server action is reachable
  // without the page that rendered the confirm box.
  .refine((form) => form.confirm === form.year, {
    message: "That doesn't match the year you typed above.",
  });

// A rollover closes sends and re-arms gates, so every surface that renders a
// gate or a send is stale afterwards — including the member home page, which is
// what redirects someone into a re-opened questionnaire.
function revalidateRolloverSurfaces(): void {
  revalidatePath("/captains/camp-settings/cycle");
  revalidatePath("/captains/questionnaires");
  revalidatePath("/");
}

/**
 * Name the camp's founding year — the cycle page's first screen, and the only
 * caller of the one-time write that adopts every row migration 0019 could only
 * stamp with a sentinel.
 */
export async function setFoundingYearAction(
  rawInput: unknown,
): Promise<SetFoundingYearActionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  const parsed = SetFoundingYearForm.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That isn't a year.",
    };
  }

  const authUser = await getAuthenticatedUser();
  const actorUserId = authUser ? (await ensureCampUser(authUser)).id : null;

  const result = await setFoundingYear({
    year: parsed.data.year,
    actorUserId: actorUserId || null,
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "already-founded"
          ? "The camp already has a year. Reload the page to see which one."
          : "That isn't a year.",
    };
  }
  revalidateRolloverSurfaces();
  return { ok: true, report: result.report };
}

/**
 * Advance the camp to the next year. Returns the executed plan as a receipt
 * (§8.4) — the page renders it rather than re-reading, because re-reading would
 * show the new state, not what just happened.
 */
export async function advanceCycleAction(
  rawInput: unknown,
): Promise<AdvanceCycleActionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  const parsed = AdvanceCycleForm.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // requireCaptain answers only "may they?", and the audit row wants "who?".
  // Re-deriving costs one extra read on an action a camp runs once a year;
  // widening the shared gate's return type to carry the user would touch every
  // other caller.
  const authUser = await getAuthenticatedUser();
  const actorUserId = authUser ? (await ensureCampUser(authUser)).id : null;

  const result = await advanceCycle({
    year: parsed.data.year,
    actorUserId: actorUserId || null,
    resetDues: parsed.data.resetDues ?? false,
    announcement: parsed.data.announcement ?? null,
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "already-advanced"
          ? "The camp has already started that year. Reload the page to see where it is now."
          : result.reason === "no-founding-year"
            ? "The camp hasn't said what year it is yet. Reload the page and start there."
            : `A new year has to be later than the one you're in, and between ${MIN_CYCLE_YEAR} and ${MAX_CYCLE_YEAR}.`,
    };
  }
  revalidateRolloverSurfaces();
  return { ok: true, report: result.report };
}
