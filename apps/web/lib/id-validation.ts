// Re-export shim: the implementation now lives in @camp404/core so it can be
// shared across apps. Existing call sites importing from "@/lib/id-validation"
// stay unchanged.
import {
  campDayKey,
  validateBirthDate,
  validateIdNumber,
} from "@camp404/core";
import { ID_NUMBER_KEY, ID_TYPE_KEY } from "@camp404/db/id-documents";

export { validateBirthDate, validateIdNumber } from "@camp404/core";
export type { IdValidationResult } from "@camp404/core";

/** The burner profile's date-of-birth question id. */
export const BIRTHDAY_KEY = "birthday";

/**
 * The cross-field checks on burner profile identity answers: the ID number
 * against the chosen document type, and a possible date of birth. The wizard
 * runs them before it moves on, and the server runs them again on a final
 * submit, because a server action takes any POST. Errors are keyed by question
 * id, as validateResponses keys them. An empty answer is left to the
 * required-field check.
 */
export function identityAnswerErrors(
  responses: Record<string, unknown>,
  now: Date,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const idNumber = responses[ID_NUMBER_KEY];
  if (typeof idNumber === "string" && idNumber.trim() !== "") {
    const type = responses[ID_TYPE_KEY];
    const result = validateIdNumber(
      typeof type === "string" ? type : null,
      idNumber,
    );
    if (!result.ok) errors[ID_NUMBER_KEY] = result.error;
  }
  const birthday = responses[BIRTHDAY_KEY];
  if (typeof birthday === "string" && birthday !== "") {
    const result = validateBirthDate(birthday, campDayKey(now));
    if (!result.ok) errors[BIRTHDAY_KEY] = result.error;
  }
  return errors;
}
