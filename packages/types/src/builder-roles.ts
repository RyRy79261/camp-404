import type { Question, QuestionRole } from "./questionnaire";

// What a camp-authored questionnaire's answers are FOR, when the app uses them
// beyond storing them. Dietary and driver facts used to be code questionnaires
// with their own tables and no page; the owner's call (OD3) is that they move
// onto the builder when the camp needs to ask them again. A captain marks a
// question with one of these roles, and a final submit copies the answer into
// dietary_requirements or this year's driver_profiles row, which the roster,
// the export and the "drivers" audience already read. The copy itself is
// `questionnaireRoleMirror` in @camp404/core, which knows which questions a
// member was actually asked.

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
