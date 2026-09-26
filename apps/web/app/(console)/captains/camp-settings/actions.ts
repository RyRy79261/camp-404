"use server";

import { revalidatePath } from "next/cache";
import { revalidateManifest } from "@/lib/manifest-revalidate";
import { z } from "zod";
import {
  moveTeam,
  renameTeam,
  setTeamArchived,
  TeamNameConflictError,
  MAX_CYCLE_NAME_LENGTH,
  MAX_CYCLE_YEAR,
  MIN_CYCLE_YEAR,
} from "@camp404/db/camp-config";
import {
  advanceCycle,
  setCycleName,
  setFoundingYear,
  type FoundingReport,
  type RolloverReport,
} from "@camp404/db/cycle-rollover";
import { captainActionGate } from "@/lib/captain-gate";
import { mutateTeamsConfig } from "@/lib/camp-config";
import { deliverAfterResponse } from "@/lib/background-work";

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

type CaptainGate =
  | { ok: true; captainId: string }
  | { ok: false; error: string };

/**
 * Captain-gate a team-settings action. Returns the captain's id (every change
 * here writes an audit row naming them), or a captain-facing error string for
 * the caller to surface.
 */
async function requireCaptain(): Promise<CaptainGate> {
  const gate = await captainActionGate("captain");
  return gate.ok ? { ok: true, captainId: gate.campUser.id } : gate;
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
    await mutateTeamsConfig(
      (config) => renameTeam(config, parsedKey.data, parsedLabel.data),
      {
        actorId: gate.captainId,
        action: "camp.teams.renamed",
        target: parsedKey.data,
        metadata: { label: parsedLabel.data },
      },
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
  revalidateManifest();
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
  await mutateTeamsConfig(
    (config) => moveTeam(config, parsedKey.data, parsedDirection.data),
    {
      actorId: gate.captainId,
      action: "camp.teams.moved",
      target: parsedKey.data,
      metadata: { direction: parsedDirection.data },
    },
  );
  revalidateTeamSurfaces();
  revalidateManifest();
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
    await mutateTeamsConfig(
      (config) => {
        const next = setTeamArchived(
          config,
          parsedKey.data,
          parsedArchived.data,
        );
        const active = next.teams.filter((team) => !team.archived).length;
        if (active < MIN_ACTIVE_TEAMS) {
          throw new TooFewActiveTeamsError();
        }
        return next;
      },
      {
        actorId: gate.captainId,
        action: parsedArchived.data
          ? "camp.teams.archived"
          : "camp.teams.unarchived",
        target: parsedKey.data,
      },
    );
  } catch (error) {
    if (error instanceof TooFewActiveTeamsError) {
      return { ok: false, error: "At least two teams must stay active." };
    }
    throw error;
  }
  revalidateTeamSurfaces();
  revalidateManifest();
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

const CYCLE_NAME_TOO_LONG = `Keep the name to ${MAX_CYCLE_NAME_LENGTH} characters or fewer.`;

const SetCycleNameForm = z.object({
  year: CycleYear,
  /** Blank removes the name. */
  name: z.string().trim().max(MAX_CYCLE_NAME_LENGTH, CYCLE_NAME_TOO_LONG),
});

export type SetCycleNameActionResult =
  | { ok: true; name: string | null }
  | { ok: false; error: string };

const AdvanceCycleForm = z
  .object({
    year: CycleYear,
    /** The same number typed a second time — the type-the-name pattern. */
    confirm: CycleYear,
    /** The year the plan on the captain's screen was read in. */
    expectedFromYear: CycleYear,
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

  const result = await setFoundingYear({
    year: parsed.data.year,
    actorUserId: gate.captainId,
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
  revalidateManifest();
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

  const result = await advanceCycle({
    year: parsed.data.year,
    expectedFromYear: parsed.data.expectedFromYear,
    actorUserId: gate.captainId,
    resetDues: parsed.data.resetDues ?? false,
    announcement: parsed.data.announcement ?? null,
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "already-advanced"
          ? "The camp has already started that year. Reload the page to see where it is now."
          : result.reason === "stale-plan"
            ? "Another captain has already moved the camp to a new year. Reload the page to see the new plan."
            : result.reason === "no-founding-year"
              ? "The camp hasn't said what year it is yet. Reload the page and start there."
              : `A new year has to be later than the one you're in, and between ${MIN_CYCLE_YEAR} and ${MAX_CYCLE_YEAR}.`,
    };
  }
  // The rollover can write a camp-wide notice and new questionnaire sends.
  deliverAfterResponse();
  revalidateRolloverSurfaces();
  revalidateManifest();
  return { ok: true, report: result.report };
}

/**
 * Set, change or remove the optional name of a year. The year number does not
 * change, so nothing is filed anywhere new: only the label beside the number
 * does, which is why this saves straight away with no confirm step.
 */
export async function setCycleNameAction(
  rawInput: unknown,
): Promise<SetCycleNameActionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  const parsed = SetCycleNameForm.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  const result = await setCycleName({
    year: parsed.data.year,
    name: parsed.data.name,
    actorUserId: gate.captainId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "unknown-year"
          ? "The camp has never had that year. Reload the page."
          : CYCLE_NAME_TOO_LONG,
    };
  }
  // The name shows beside the year on the cycle page and on every results page.
  revalidatePath("/captains/camp-settings/cycle");
  revalidatePath("/captains/questionnaires", "layout");
  return { ok: true, name: result.cycle.name ?? null };
}
