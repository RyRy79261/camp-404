import type {
  Question,
  QuestionnaireResponses,
  QuestionRole,
} from "./questionnaire";
import {
  evalVisibleIf,
  type BuilderQuestionnaire,
} from "./questionnaire-builder";

// What a camp-authored questionnaire's answers are FOR, when the app uses them
// beyond storing them. Dietary and driver facts used to be code questionnaires
// with their own tables and no page; the owner's call (OD3) is that they move
// onto the builder when the camp needs to ask them again. A captain marks a
// question with one of these roles, and a final submit copies the answer into
// dietary_requirements or this year's driver_profiles row, which the roster,
// the export and the "drivers" audience already read.

export type BuilderRole = Extract<
  QuestionRole,
  | "dietary_allergies"
  | "dietary_anaphylactic"
  | "dietary_notes"
  | "driving_this_year"
  | "arrival_date"
  | "departure_date"
>;

/** Each builder role: how it reads to a captain, and the kinds that hold it. */
export const BUILDER_ROLES: Record<
  BuilderRole,
  { label: string; kinds: readonly Question["kind"][] }
> = {
  dietary_allergies: {
    label: "Allergies (the kitchen and team leads see this)",
    kinds: ["short_text", "long_text"],
  },
  dietary_anaphylactic: {
    label: "Has an anaphylactic allergy",
    kinds: ["boolean"],
  },
  dietary_notes: {
    label: "Dietary notes",
    kinds: ["short_text", "long_text"],
  },
  driving_this_year: {
    label: "Driving to camp this year (joins the drivers audience)",
    kinds: ["boolean"],
  },
  arrival_date: { label: "Arrival day", kinds: ["date"] },
  departure_date: { label: "Departure day", kinds: ["date"] },
};

const ROLE_ORDER = Object.keys(BUILDER_ROLES) as BuilderRole[];

/** The builder roles a question of this kind may carry, in menu order. */
export function builderRolesFor(kind: Question["kind"]): BuilderRole[] {
  return ROLE_ORDER.filter((role) => BUILDER_ROLES[role].kinds.includes(kind));
}

export function isBuilderRole(role: unknown): role is BuilderRole {
  return typeof role === "string" && role in BUILDER_ROLES;
}

/** What a final submit writes to dietary_requirements, or null for nothing. */
export interface DietaryMirror {
  allergies?: string | null;
  isAnaphylactic?: boolean;
  notes?: string | null;
}

/** What a final submit writes to this year's driver_profiles row. */
export interface DriverMirror {
  intendsToDrive?: boolean;
  arrivalAt?: Date | null;
  departureAt?: Date | null;
}

export interface RoleMirror {
  dietary: DietaryMirror | null;
  driver: DriverMirror | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A date answer ("2027-04-26") as the start of that day in UTC, or null. */
function dayAnswer(value: unknown): Date | null {
  if (typeof value !== "string" || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function textAnswer(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The domain-table facts a submitted questionnaire carries. Every role question
 * in the definition writes its column: its answer when the member can see it,
 * and empty (null, or false for a yes/no) when it is hidden or unanswered, so a
 * member who now says "no allergies" does not keep last year's list. A
 * questionnaire with no role question writes nothing.
 */
export function builderRoleMirror(
  definition: BuilderQuestionnaire,
  responses: QuestionnaireResponses,
): RoleMirror {
  const dietary: DietaryMirror = {};
  const driver: DriverMirror = {};
  for (const page of definition.pages) {
    const pageShown =
      !page.visibleIf || evalVisibleIf(page.visibleIf, responses);
    for (const block of page.blocks) {
      if (block.kind !== "question") continue;
      const q = block.question;
      const role = "role" in q ? q.role : undefined;
      if (!isBuilderRole(role)) continue;
      const shown =
        pageShown &&
        (!block.visibleIf || evalVisibleIf(block.visibleIf, responses));
      const value = shown ? responses[q.id] : undefined;
      switch (role) {
        case "dietary_allergies":
          dietary.allergies = textAnswer(value);
          break;
        case "dietary_notes":
          dietary.notes = textAnswer(value);
          break;
        case "dietary_anaphylactic":
          dietary.isAnaphylactic = value === true;
          break;
        case "driving_this_year":
          driver.intendsToDrive = value === true;
          break;
        case "arrival_date":
          driver.arrivalAt = dayAnswer(value);
          break;
        case "departure_date":
          driver.departureAt = dayAnswer(value);
          break;
      }
    }
  }
  return {
    dietary: Object.keys(dietary).length > 0 ? dietary : null,
    driver: Object.keys(driver).length > 0 ? driver : null,
  };
}
