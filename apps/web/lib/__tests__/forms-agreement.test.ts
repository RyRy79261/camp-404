// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerRank } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// My forms and the questionnaire catalogue, through lib/forms.ts and
// lib/questionnaire-definitions.ts, on the database and on the E2E store. The
// store models no builder questionnaire and no send, so on a camp that has
// none the two sides must already agree: a code questionnaire reads as its
// template, the hub and the open sends are empty, and nothing is answered or
// optional. Both keep the forms' change log, which a member's own "Coming
// this year?" answer writes. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  getJustAnswered,
  listAnsweredQuestionnaires,
  listFormEdits,
  listOptionalForms,
} from "../forms";
import { ATTENDANCE_EDIT_KEY } from "@camp404/db/participations";
import { saveAttendanceAnswer } from "../participations";
import { QUESTIONNAIRE_VERSION } from "../questionnaire";
import {
  getBuilderDefinition,
  getQuestionnaireDefinition,
  listDefinitionsForViewer,
  listOpenSendBlocking,
  listOpenSendGates,
} from "../questionnaire-definitions";

describe("My forms and the catalogue: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("reads a camp with no builder questionnaires the same way, and keeps a form's change log", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const burner = await getQuestionnaireDefinition("burner_profile");
      await saveAttendanceAnswer({
        userId: p.member,
        intent: "yes",
        edit: {
          version: QUESTIONNAIRE_VERSION,
          editedByUserId: p.member,
          changes: [
            {
              fieldId: "participation_intent",
              label: "Coming?",
              from: "",
              to: "yes",
            },
          ],
        },
      });
      return {
        burner: burner && { title: burner.title, pages: burner.pages.length },
        builder: await getBuilderDefinition("not-a-questionnaire"),
        hub: await listDefinitionsForViewer({
          userId: p.captain,
          rank: ViewerRank.enum.captain,
        }),
        blocking: [...(await listOpenSendBlocking()).entries()],
        gates: await listOpenSendGates(),
        answered: await listAnsweredQuestionnaires(p.member),
        optional: await listOptionalForms(p.member),
        justAnswered: await getJustAnswered(
          p.member,
          "00000000-0000-4000-8000-000000000000",
        ),
        edits: (await listFormEdits(p.member, ATTENDANCE_EDIT_KEY)).map(
          (e) => ({
            version: e.version,
            editedByUserId: e.editedByUserId,
            changes: e.changes,
          }),
        ),
        othersEdits: await listFormEdits(p.other, ATTENDANCE_EDIT_KEY),
      };
    });
    expect(db).toMatchObject({
      builder: null,
      hub: [],
      blocking: [],
      gates: [],
      answered: [],
      optional: [],
      justAnswered: null,
      edits: [{ editedByUserId: "@member" }],
      othersEdits: [],
    });
    expect(store).toEqual(db);
  });
});
