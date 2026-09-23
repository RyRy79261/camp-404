import type { EmergencyContact } from "./member";
import {
  flattenQuestions,
  telegramUsername,
  type Question,
  type QuestionRole,
  type Questionnaire,
} from "./questionnaire";

// Reading answers by what they are FOR (a question's `role`), not by question
// id. See QUESTION_ROLES in ./questionnaire.

/** The most emergency contacts a member lists (matches SignupInput). */
export const MAX_EMERGENCY_CONTACTS = 2;

/** The questions carrying a role, in questionnaire order. */
export function questionsWithRole(
  questionnaire: Questionnaire,
  role: QuestionRole,
): Question[] {
  return flattenQuestions(questionnaire).filter(
    (q) => "role" in q && q.role === role,
  );
}

/** The id of the first question carrying a role, or null when none does. */
export function questionIdForRole(
  questionnaire: Questionnaire,
  role: QuestionRole,
): string | null {
  return questionsWithRole(questionnaire, role)[0]?.id ?? null;
}

/**
 * The Telegram username a response map carries, for users.telegram_handle:
 * the bare username, null when the answer is blank (which clears it), or
 * undefined when this save does not carry the question at all (a progress save
 * from another page), so the column is left alone.
 */
export function telegramHandleFromResponses(
  questionnaire: Questionnaire,
  responses: Record<string, unknown>,
): string | null | undefined {
  const id = questionIdForRole(questionnaire, "telegram_handle");
  if (!id || !(id in responses)) return undefined;
  const value = responses[id];
  return typeof value === "string" ? telegramUsername(value) : null;
}

/** The questionnaire's emergency contact slots: the Nth name, phone and relationship questions make contact N. */
function contactSlots(questionnaire: Questionnaire) {
  const names = questionsWithRole(questionnaire, "emergency_contact_name");
  const phones = questionsWithRole(questionnaire, "emergency_contact_phone");
  const relations = questionsWithRole(
    questionnaire,
    "emergency_contact_relationship",
  );
  const count = Math.min(
    names.length,
    phones.length,
    relations.length,
    MAX_EMERGENCY_CONTACTS,
  );
  return Array.from({ length: count }, (_, i) => ({
    name: names[i]!.id,
    phone: phones[i]!.id,
    relationship: relations[i]!.id,
  }));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Take the emergency contact answers out of a response map, like the ID
 * number is taken out before it is stored. Returns the map without any
 * emergency contact answer, and the contacts whose name, phone and
 * relationship were all given, in slot order. A half-filled slot is dropped.
 */
export function splitEmergencyContacts(
  questionnaire: Questionnaire,
  responses: Record<string, unknown>,
): { cleaned: Record<string, unknown>; contacts: EmergencyContact[] } {
  const slots = contactSlots(questionnaire);
  const roleIds = new Set(
    (
      [
        "emergency_contact_name",
        "emergency_contact_phone",
        "emergency_contact_relationship",
      ] as const
    ).flatMap((role) =>
      questionsWithRole(questionnaire, role).map((q) => q.id),
    ),
  );
  const cleaned = Object.fromEntries(
    Object.entries(responses).filter(([id]) => !roleIds.has(id)),
  );
  const contacts = slots
    .map((slot) => ({
      name: text(responses[slot.name]),
      phone: text(responses[slot.phone]),
      relationship: text(responses[slot.relationship]),
    }))
    .filter((c) => c.name !== "" && c.phone !== "" && c.relationship !== "");
  return { cleaned, contacts };
}

/**
 * Put stored contacts back into a response map, slot by slot, so the member's
 * own replay form shows them. The inverse of splitEmergencyContacts.
 */
export function mergeEmergencyContacts(
  questionnaire: Questionnaire,
  responses: Record<string, unknown>,
  contacts: readonly EmergencyContact[] | null,
): Record<string, unknown> {
  if (!contacts || contacts.length === 0) return responses;
  const merged = { ...responses };
  contactSlots(questionnaire).forEach((slot, i) => {
    const contact = contacts[i];
    if (!contact) return;
    merged[slot.name] = contact.name;
    merged[slot.phone] = contact.phone;
    merged[slot.relationship] = contact.relationship;
  });
  return merged;
}

/** The refusal on a half-filled emergency contact's empty fields. */
export const INCOMPLETE_CONTACT_ERROR =
  "Add this too, or clear this contact's other answers.";

/**
 * A contact is all or nothing: name, phone and relationship together. For each
 * slot with some but not all three answered, an error on each empty one, keyed
 * by question id. Without this a half-filled second contact would be dropped
 * without a word when the answers are split out.
 */
export function incompleteContactErrors(
  questionnaire: Questionnaire,
  responses: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const slot of contactSlots(questionnaire)) {
    const ids = [slot.name, slot.phone, slot.relationship];
    const empty = ids.filter((id) => text(responses[id]) === "");
    if (empty.length > 0 && empty.length < ids.length) {
      for (const id of empty) errors[id] = INCOMPLETE_CONTACT_ERROR;
    }
  }
  return errors;
}
