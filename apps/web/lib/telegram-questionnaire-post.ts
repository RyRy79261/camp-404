import "server-only";

import * as lifecycle from "@camp404/db/questionnaire-lifecycle";
import * as posts from "@camp404/db/telegram-posts";
import { twin } from "./twin";

// "Post in Telegram" on a sent questionnaire (owner's mock-up, 2026-10-27):
// who it still waits on, for the dialog, and the post itself. The test store
// holds no questionnaire sends, so its side answers "no such send";
// lib/__tests__/telegram-agreement.test.ts holds the two sides equal.

const NO_SEND = "That send no longer exists.";

const read = twin(
  posts,
  {
    questionnairePostDialog: (
      _activationId: string,
    ): posts.QuestionnairePostDialog | null => null,
  },
  ["questionnairePostDialog"],
);

const write = twin(
  lifecycle,
  {
    postQuestionnaireInTelegram: (
      _input: Parameters<typeof lifecycle.postQuestionnaireInTelegram>[0],
    ): lifecycle.PostInTelegramResult => ({ ok: false, error: NO_SEND }),
  },
  ["postQuestionnaireInTelegram"],
);

export type { QuestionnairePostDialog } from "@camp404/db/telegram-posts";
export const questionnairePostDialog = read.questionnairePostDialog;
export const postQuestionnaireInTelegram = write.postQuestionnaireInTelegram;
