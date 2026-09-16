import { describe, expect, it } from "vitest";
import type * as schema from "@camp404/db/schema";
import { encrypt } from "@camp404/db/crypto";
import { shapeUser } from "@/lib/mcp/tools/people";

// The people tools take their columns from the app's one field-access list
// (canReadMemberField). These pin what each caller gets back.

process.env.PGCRYPTO_KEY = "test-pgcrypto-key-at-least-16-chars";

const SUBJECT = "00000000-0000-0000-0000-0000000000bb";
const CALLER = "00000000-0000-0000-0000-0000000000aa";

function row(
  overrides: Partial<typeof schema.users.$inferSelect> = {},
): typeof schema.users.$inferSelect {
  return {
    id: SUBJECT,
    authUserId: "auth-bb",
    displayName: "Grace",
    profileImageUrl: null,
    rank: "member",
    isSystem: false,
    membershipTier: "full",
    duesPaid: true,
    duesPaidAt: new Date("2026-08-01T00:00:00Z"),
    passportEncrypted: encrypt("P1234567"),
    saIdEncrypted: null,
    eftDetailsEncrypted: null,
    skills: ["welding"],
    previousAfrikaburns: 3,
    previousBurningMans: 0,
    firstTime: false,
    emergencyContacts: [
      { name: "Ada", phone: "+27 82 555 0000", relationship: "sister" },
    ],
    inviteCode: "amber-fox-7",
    approvalStatus: "approved",
    approvalDecidedByUserId: null,
    approvalDecidedAt: null,
    approvalDecisionReason: null,
    termsVersion: "1",
    termsConsentedAt: null,
    sanitised: false,
    sanitisedAt: null,
    lostCatNumber: null,
    telegramHandle: "grace",
    telegramUserId: "123",
    aiDataConsent: true,
    aiDataConsentAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const memberships = [{ team: "kitchen", isLead: true }];

describe("shapeUser", () => {
  it("gives another member only what the member roster shows", () => {
    const shaped = shapeUser(row(), memberships, {
      campUserId: CALLER,
      isCaptain: false,
    });

    expect(Object.keys(shaped).sort()).toEqual(
      [
        "displayName",
        "id",
        "isLead",
        "isSystem",
        "lostCatNumber",
        "memberships",
        "rank",
        "sanitised",
      ].sort(),
    );
  });

  it("gives a captain the captain fields and, with consent, the ID documents", () => {
    const shaped = shapeUser(row(), memberships, {
      campUserId: CALLER,
      isCaptain: true,
    });

    expect(shaped).toMatchObject({
      duesPaid: true,
      skills: ["welding"],
      emergencyContacts: [expect.objectContaining({ name: "Ada" })],
      passport: "P1234567",
    });
    // Never a raw ciphertext or an identity link, whatever the rank.
    expect(shaped).not.toHaveProperty("passportEncrypted");
    expect(shaped).not.toHaveProperty("authUserId");
  });

  it("withholds a captain's view of ID documents without consent", () => {
    const shaped = shapeUser(row({ aiDataConsent: false }), memberships, {
      campUserId: CALLER,
      isCaptain: true,
    });

    expect(shaped).not.toHaveProperty("passport");
    expect(shaped.duesPaid).toBe(true);
  });

  it("gives a member all of their own fields", () => {
    const shaped = shapeUser(row({ aiDataConsent: false }), memberships, {
      campUserId: SUBJECT,
      isCaptain: false,
    });

    expect(shaped).toMatchObject({
      emergencyContacts: [expect.objectContaining({ name: "Ada" })],
      duesPaid: true,
      passport: "P1234567",
    });
  });
});
