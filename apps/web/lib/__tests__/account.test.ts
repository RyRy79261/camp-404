import { describe, it, expect } from "vitest";
import { lostCatName, sanitisedUserPatch } from "@camp404/db/account";

describe("lostCatName", () => {
  it("formats the Lost Cat stub name", () => {
    expect(lostCatName(1)).toBe("Lost Cat #1");
    expect(lostCatName(42)).toBe("Lost Cat #42");
  });
});

describe("sanitisedUserPatch", () => {
  const now = new Date("2026-05-30T12:00:00.000Z");
  const patch = sanitisedUserPatch("user-123", 7, now);

  it("anonymises the display name and severs the auth link", () => {
    expect(patch.displayName).toBe("Lost Cat #7");
    expect(patch.authUserId).toBe("deleted:user-123");
  });

  it("nulls every PII column", () => {
    expect(patch.profileImageUrl).toBeNull();
    expect(patch.passportEncrypted).toBeNull();
    expect(patch.saIdEncrypted).toBeNull();
    expect(patch.eftDetailsEncrypted).toBeNull();
    expect(patch.emergencyContacts).toBeNull();
    expect(patch.telegramHandle).toBeNull();
    expect(patch.telegramUserId).toBeNull();
    expect(patch.termsVersion).toBeNull();
    expect(patch.termsConsentedAt).toBeNull();
  });

  it("stamps the sanitisation flags + number", () => {
    expect(patch.sanitised).toBe(true);
    expect(patch.sanitisedAt).toBe(now);
    expect(patch.lostCatNumber).toBe(7);
    expect(patch.updatedAt).toBe(now);
  });
});
