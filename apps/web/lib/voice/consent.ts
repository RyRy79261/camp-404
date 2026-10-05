import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { usesTestStore } from "../test-mode";
import { voiceTestStore } from "../test-store-voice";

// The one-time voice notice (#356; POPIA s18 notice, s72 cross-border
// transfer): before a captain's first recording, they read that their voice
// goes to Groq to become words and the words to Anthropic's Claude, that
// neither is kept here, and that nothing is saved until they press Do. Their
// yes is `users.voice_consent_at`; withdrawing clears it, and so does erasure.

export const VOICE_NOTICE =
  "Your voice is sent to Groq to become words, and the words to Anthropic's Claude to work out what you mean. Neither is kept here. Nothing is saved until you press Do.";

export async function getVoiceConsent(userId: string): Promise<Date | null> {
  if (usesTestStore()) return voiceTestStore.getConsent(userId);
  const [row] = await createHttpDb()
    .select({ at: schema.users.voiceConsentAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.at ?? null;
}

export async function setVoiceConsent(userId: string, on: boolean): Promise<void> {
  const at = on ? new Date() : null;
  if (usesTestStore()) {
    voiceTestStore.setConsent(userId, at);
    return;
  }
  await createHttpDb()
    .update(schema.users)
    .set({ voiceConsentAt: at, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}
