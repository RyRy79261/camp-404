import { eq } from "drizzle-orm";
import { createHttpDb } from "./index";
import { campSettings, questionnaireDefinitions } from "./schema";
import {
  currentCycle,
  resolveCodeCarryOver,
  resolveCycles,
  UNSET_CYCLE,
  type CarryOverPolicy,
  type CycleEntry,
} from "./camp-config";
import { RESERVED_DEFINITION_KEYS } from "./questionnaire-definitions";

// The year namespace, read side. A "cycle" is one burn year and the year IS the
// cycle — a single number that both names the year and namespaces its rows. See
// docs/superpowers/specs/2026-09-08-year-namespace-design.md for why it is an
// integer on two tables rather than an entity with foreign keys.
//
// The policy for one questionnaire lives in one of two disjoint places:
//
//   builder questionnaires → questionnaire_definitions.carry_over (a column)
//   the RESERVED code keys → camp_settings.config.questionnaireCarryOver[key]
//
// They cannot overlap: RESERVED_DEFINITION_KEYS means a code key can never have
// a definitions row, and a builder key is never written into the config map.
// Unknown keys read as `carry`, matching the column default — the rollover does
// nothing at all until a captain opts a specific questionnaire in.

export type { CarryOverPolicy, CycleEntry };

/**
 * The carry-over policy for one questionnaire key.
 *
 * Precedence: the definition column, then the config map, then `carry`. Callers
 * that hold an activation should read `activation.carryOver` instead — that is
 * the copy frozen at Send time, and it is what every downstream read must use
 * so a captain flipping the toggle mid-collection cannot change the rules under
 * a member who is halfway through the form.
 */
export async function carryOverFor(key: string): Promise<CarryOverPolicy> {
  const db = createHttpDb();
  if (!RESERVED_DEFINITION_KEYS.has(key)) {
    const [row] = await db
      .select({ carryOver: questionnaireDefinitions.carryOver })
      .from(questionnaireDefinitions)
      .where(eq(questionnaireDefinitions.key, key))
      .limit(1);
    if (row) return row.carryOver ? "carry" : "fresh";
  }
  const [settings] = await db
    .select({ config: campSettings.config })
    .from(campSettings)
    .limit(1);
  return resolveCodeCarryOver(settings?.config, key);
}

/**
 * The year to stamp on an activation being opened right now. Read once at Send
 * and frozen onto the row — never re-read at submit time, or a rollover landing
 * mid-form would move a member's answer into the wrong year.
 *
 * Falls back to UNSET_CYCLE on a camp that has not named its founding year yet,
 * which is the same sentinel migration 0019 stamped on every pre-existing row —
 * so a send made before a captain gets to the cycle page is swept into the real
 * year by the same rewrite, rather than stranded under an invented one.
 */
export async function currentCycleNumber(): Promise<number> {
  const db = createHttpDb();
  const [row] = await db
    .select({ config: campSettings.config })
    .from(campSettings)
    .limit(1);
  return currentCycle(resolveCycles(row?.config))?.year ?? UNSET_CYCLE;
}
