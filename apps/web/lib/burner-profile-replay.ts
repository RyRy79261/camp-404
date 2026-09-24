import {
  incompleteContactErrors,
  validateResponses,
  type Questionnaire,
  type QuestionnaireResponses,
} from "@camp404/types";
import { identityAnswerErrors } from "./id-validation";
import { getQuestionnaireForResponses } from "./questionnaire-config";

/** The outcome of checking a replayed form's final submit. */
export type ReplayValidation =
  | {
      ok: true;
      responses: QuestionnaireResponses;
      /** The questionnaire the stored and new answers are diffed against. */
      diffAgainst: Questionnaire;
    }
  | { ok: false; errors: Record<string, string> };

/**
 * The server's checks on a burner profile re-submit. Kept out of lib/forms so
 * the replay action's tests can run the real checks against a stubbed form.
 *
 * It validates and diffs against ALL teams (incl. archived), not the
 * active-only picker the member saw: the multi_select validator silently DROPS
 * values not in its options, so validating an old response that picked a
 * since-archived team against the active set would erase it on re-save. The
 * full catalogue is the superset that keeps it valid and labelled.
 */
export async function validateBurnerProfileReplay(
  raw: unknown,
  now: Date,
): Promise<ReplayValidation> {
  const catalogue = await getQuestionnaireForResponses();
  const result = validateResponses(catalogue, raw);
  if (!result.ok) return { ok: false, errors: result.errors };
  // The wizard checks these before it submits; a direct POST skips it.
  const identity = identityAnswerErrors(result.responses, now);
  if (Object.keys(identity).length > 0) {
    return {
      ok: false,
      errors: { ...identity, _root: "Check your ID number and date of birth." },
    };
  }
  const contactErrors = incompleteContactErrors(catalogue, result.responses);
  if (Object.keys(contactErrors).length > 0) {
    return {
      ok: false,
      errors: {
        ...contactErrors,
        _root: "Finish or clear your second emergency contact.",
      },
    };
  }
  return { ok: true, responses: result.responses, diffAgainst: catalogue };
}
