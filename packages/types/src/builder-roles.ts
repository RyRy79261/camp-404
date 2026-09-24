import {
  PARTICIPATION_INTENTS,
  type ParticipationIntent,
} from "./participation";
import {
  Questionnaire,
  type Question,
  type QuestionRole,
  type SingleSelectQuestion,
} from "./questionnaire";

// What a camp-authored questionnaire's answers are FOR, when the app uses them
// beyond storing them. Dietary and driver facts used to be code questionnaires
// with their own tables and no page; the owner's call (OD3) is that they move
// onto the builder when the camp needs to ask them again. A captain marks a
// question with one of these roles, and a final submit copies the answer into
// dietary_requirements or this year's driver_profiles row, which the roster,
// the export and the "drivers" audience already read. The copy itself is
// `questionnaireRoleMirror` in @camp404/core, which knows which questions a
// member was actually asked.
//
// `participation_intent` is the one role that writes a member's place rather
// than a fact about them: its Yes / Maybe / No sets this year's
// camp_participations row, and a missing answer never clears it.

export type BuilderRole = Extract<
  QuestionRole,
  | "dietary_allergies"
  | "dietary_anaphylactic"
  | "dietary_notes"
  | "driving_this_year"
  | "arrival_date"
  | "departure_date"
  | "participation_intent"
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
  participation_intent: {
    label: "Coming this year (Yes / Maybe / No: sets their place for the year)",
    kinds: ["single_select"],
  },
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
  /** The member's Yes / Maybe / No for the send's year, or null for nothing. */
  participation: { intent: ParticipationIntent } | null;
}

// --- Coming this year? -------------------------------------------------------

/**
 * The options a participation_intent question carries. The values are fixed
 * (PARTICIPATION_INTENTS): the builder fills them in when a captain picks the
 * role, and publishing refuses any other set.
 */
export const PARTICIPATION_INTENT_OPTIONS: readonly {
  value: ParticipationIntent;
  label: string;
}[] = [
  { value: "yes", label: "Yes, I'm coming" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No, not this year" },
];

/**
 * True when a participation_intent question can publish: its option values
 * are exactly yes, maybe and no (labels are the captain's to word), and it
 * takes no "Other…" answer, which no place could be read from.
 */
export function hasParticipationOptions(q: SingleSelectQuestion): boolean {
  if (q.allowOther) return false;
  const values = q.options.map((o) => o.value);
  return (
    values.length === PARTICIPATION_INTENTS.length &&
    PARTICIPATION_INTENTS.every((intent) => values.includes(intent))
  );
}

/** The publish refusal for a participation_intent question that fails it. */
export function participationOptionsMessage(prompt: string): string {
  return `"${prompt}" sets each member's place for the year, so its options must be exactly yes, maybe and no, with "Other" off. Set its use to Nothing else and back to put them back.`;
}

export const ATTENDANCE_QUESTION_PROMPT =
  "Are you coming to AfrikaBurn with Camp 404 this year?";

/**
 * The one-question "Coming this year?" questionnaire a captain creates with
 * one click. The same definition backs the member's own form under My forms.
 */
export function attendanceQuestionnaire(): Questionnaire {
  return Questionnaire.parse({
    version: "1",
    title: "Coming this year?",
    pages: [
      {
        id: "coming-this-year",
        kind: "questions",
        title: "Coming this year?",
        questions: [
          {
            id: "coming",
            kind: "single_select",
            prompt: ATTENDANCE_QUESTION_PROMPT,
            required: true,
            display: "radio",
            role: "participation_intent",
            options: PARTICIPATION_INTENT_OPTIONS.map(({ value, label }) => ({
              value,
              label,
            })),
          },
        ],
      },
    ],
  });
}
