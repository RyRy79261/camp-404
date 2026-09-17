import {
  incompleteContactErrors,
  type Questionnaire,
  type QuestionnaireResponses,
} from "@camp404/types";
import { identityAnswerErrors } from "@/lib/id-validation";

/**
 * The checks across answers that the code questionnaires (the burner profile,
 * and its My forms replay) make before a member moves on: the ID number against
 * its document type, a possible date of birth, and an emergency contact that is
 * all or nothing. The save actions run the same checks again on submit, because
 * a server action takes any POST. For the runner's `checkAnswers`.
 */
export function profileAnswerChecks(
  questionnaire: Questionnaire,
): (responses: QuestionnaireResponses) => Record<string, string> {
  return (responses) => ({
    ...identityAnswerErrors(responses, new Date()),
    ...incompleteContactErrors(questionnaire, responses),
  });
}
