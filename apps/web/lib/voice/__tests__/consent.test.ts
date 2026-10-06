// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@camp404/db/schema";
import { sanitiseAccount } from "@camp404/db/account";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { getVoiceConsent, setVoiceConsent } from "../consent";

// The one-time voice notice (#356): stored as users.voice_consent_at, cleared
// when the captain turns voice off, and by erasure.

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

describe("voice consent", () => {
  it("is nothing until the captain turns voice on, and nothing again once they turn it off", async () => {
    await makeUser(h.db(), { rank: "captain" });
    const captain = await makeUser(h.db(), { rank: "captain" });
    expect(await getVoiceConsent(captain.id)).toBeNull();
    await setVoiceConsent(captain.id, true);
    expect(await getVoiceConsent(captain.id)).toBeInstanceOf(Date);
    await setVoiceConsent(captain.id, false);
    expect(await getVoiceConsent(captain.id)).toBeNull();
  });

  it("is cleared when the account is erased", async () => {
    await makeUser(h.db(), { rank: "captain" });
    const captain = await makeUser(h.db(), { rank: "captain" });
    await setVoiceConsent(captain.id, true);
    expect((await sanitiseAccount(captain.id)).ok).toBe(true);
    const [row] = await h
      .db()
      .select({ at: schema.users.voiceConsentAt })
      .from(schema.users)
      .where(eq(schema.users.id, captain.id));
    expect(row!.at).toBeNull();
  });
});
