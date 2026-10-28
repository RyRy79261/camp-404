import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { voiceTestStore } from "../test-store-voice";
import { twin } from "../twin";

// The one-time voice notice (#356; POPIA s18 notice, s72 cross-border
// transfer): before a captain's first recording, they read that their voice
// goes to Groq to become words and the words to Anthropic's Claude, that
// neither is kept here, and that nothing is saved until they press Do. Their
// yes is `users.voice_consent_at`; withdrawing clears it, and so does erasure.
// The notice's words are VOICE_NOTICE (./notice). Under E2E the test store's
// twin holds it.

const db = {
  async getConsent(userId: string): Promise<Date | null> {
    const [row] = await createHttpDb()
      .select({ at: schema.users.voiceConsentAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return row?.at ?? null;
  },

  async setConsent(userId: string, at: Date | null): Promise<void> {
    await createHttpDb()
      .update(schema.users)
      .set({ voiceConsentAt: at, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  },
};

const consent = twin(db, voiceTestStore, ["getConsent", "setConsent"]);

export const getVoiceConsent = consent.getConsent;

export async function setVoiceConsent(
  userId: string,
  on: boolean,
): Promise<void> {
  await consent.setConsent(userId, on ? new Date() : null);
}
