import "server-only";

import { cache } from "react";
import * as profiles from "@camp404/db/burner-profile";
import { profileChecklist, type ProfileChecklist } from "@camp404/core";
import { telegramBotUsername } from "./telegram";
import { testStore } from "./test-store";
import { twin } from "./twin";

// "Your profile isn't finished" (owner's mock-up, step 6): one grouped notice
// at the top of the bell's panel and the inbox, and a card on Profile. Worked
// out on each read from the member's own row (the rule is profileChecklist in
// @camp404/core); nothing is stored and nothing is blocked.

const facts = twin(profiles, testStore, ["getProfileFacts"]);

/**
 * The signed-in member's checklist, or null when they get none (not approved,
 * or held by a blocking questionnaire). Cached per request, so the badge, the
 * panel and the page share one read.
 */
export const getProfileChecklist = cache(
  async (userId: string): Promise<ProfileChecklist | null> =>
    profileChecklist(await facts.getProfileFacts(userId), {
      telegramOffered: telegramBotUsername() !== null,
    }),
);
