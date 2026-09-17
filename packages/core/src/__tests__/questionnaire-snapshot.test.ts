// Ported from AB's regression tests for its questionnaire-activation snapshot.
//
// THE BUG (AB task #59): answers were rendered, validated and aggregated
// against the LIVE definition, so editing a definition after it was sent
// retroactively changed what already-submitted respondents were judged
// against — silently orphaning answers.
//
// Camp 404 stores the same guarantee differently: every published version is
// an immutable `questionnaire_versions` snapshot, and a response records the
// version it answered. AB's `resolveActivationDefinition` (snapshot ?? live)
// belongs to its activation module, which is not part of this engine, so what
// is ported here are the two properties the snapshot exists for, run through
// the unified runtime and Camp 404's results engine:
//   1. The snapshot a respondent answered still validates and aggregates their
//      answers after the definition is edited.
//   2. Judging the same answers against the live edit is exactly the silent
//      loss the snapshot prevents.

import { describe, it, expect } from "vitest";
import { Questionnaire } from "@camp404/types";
import { validateSubmission } from "../questionnaire-runtime";
import { aggregateResponses } from "../questionnaire-results";

/** The definition AS SENT (the snapshot). */
const SENT_DEFINITION = Questionnaire.parse({
  version: "1",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Crew briefing",
      questions: [
        {
          id: "shift",
          kind: "single_select",
          prompt: "Which shift suits you?",
          options: [
            { value: "afternoon", label: "Afternoon" },
            { value: "evening", label: "Evening" },
          ],
          required: true,
        },
      ],
    },
  ],
});

/** The SAME definition after the author edited it post-send: the original
 * question is gone, a NEW required question took its place, and the version
 * was bumped. */
const EDITED_DEFINITION = Questionnaire.parse({
  version: "2",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Crew briefing (revised)",
      questions: [
        {
          id: "arrival",
          kind: "single_select",
          prompt: "Which day do you arrive?",
          options: [
            { value: "wed", label: "Wednesday" },
            { value: "thu", label: "Thursday" },
          ],
          required: true,
        },
      ],
    },
  ],
});

describe("editing a definition after sending does not change what its snapshot validates", () => {
  const sentAnswer = { shift: "evening" };

  it("validates a respondent's submission against the SNAPSHOT", () => {
    const result = validateSubmission(SENT_DEFINITION, sentAnswer);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.responses).toEqual({ shift: "evening" });
  });

  it("proves the bug: validating the SAME answer against the live edit would reject it and demand the new question", () => {
    const wrong = validateSubmission(EDITED_DEFINITION, sentAnswer);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      // The now-required v2 question the respondent never saw blocks them.
      expect(wrong.errors).toHaveProperty("arrival");
    }
  });
});

describe("results aggregate against the snapshot, preserving answers as sent", () => {
  const submitted = [{ shift: "evening" }, { shift: "afternoon" }];

  it("aggregates against the SNAPSHOT: the sent question is summarised, nothing is orphaned", () => {
    const results = aggregateResponses(SENT_DEFINITION, submitted);

    expect(results.questions.map((q) => q.questionId)).toEqual(["shift"]);
    const shift = results.questions[0];
    expect(shift?.shape).toBe("choice");
    if (shift?.shape === "choice") {
      const evening = shift.rows.find((row) => row.value === "evening");
      expect(evening?.count).toBe(1);
    }
    expect(results.orphans).toEqual([]);
  });

  it("proves the bug: aggregating against the live edit orphans every real answer under the deleted question", () => {
    const results = aggregateResponses(EDITED_DEFINITION, submitted);
    // The live definition only knows "arrival" — the actual "shift" answers are
    // now orphans (counted, never shown), exactly the loss the snapshot
    // prevents.
    expect(results.questions.map((q) => q.questionId)).toEqual(["arrival"]);
    expect(results.orphans).toEqual([
      { questionId: "shift", answered: 2, respondents: 2 },
    ]);
  });
});
