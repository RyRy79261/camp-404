import { describe, expect, it } from "vitest";
import type * as schema from "@camp404/db/schema";
import { encrypt } from "@camp404/db/crypto";
import { sensitiveReadEvents, shapeUser } from "@/lib/mcp/tools/people";

// The people tools take their columns from the app's one field-access list
// (canReadMemberField) at the caller's real rung. These pin what each caller
// gets back: a lead gets emergency contacts on a one-person read, nobody gets
// an ID or bank number from these tools.

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
    duesPaid: true,
    duesPaidAt: new Date("2026-08-01T00:00:00Z"),
    refCode: "C404-M001",
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
    voiceConsentAt: null,
    campTitle: null,
    campBlurb: null,
    showOnJoin: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const memberships = [{ team: "kitchen", isLead: true }];

const member = { campUserId: CALLER, viewerRank: "camp_member" as const };
const lead = { campUserId: CALLER, viewerRank: "team_lead" as const };
const captain = { campUserId: CALLER, viewerRank: "captain" as const };

describe("shapeUser", () => {
  it("gives another member only what the member roster shows", () => {
    const shaped = shapeUser(row(), memberships, member, { safety: true });

    expect(Object.keys(shaped).sort()).toEqual(
      [
        "approvalStatus",
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

  it("gives a team lead the safety data the website gives leads, on a one-person read", () => {
    const shaped = shapeUser(row(), memberships, lead, { safety: true });
    expect(shaped.emergencyContacts).toEqual([
      expect.objectContaining({ name: "Ada" }),
    ]);
    // Still not the captain columns.
    expect(shaped).not.toHaveProperty("duesPaid");
    expect(shaped).not.toHaveProperty("skills");
  });

  it("leaves safety data out of a list, for every rank", () => {
    for (const viewer of [lead, captain]) {
      expect(
        shapeUser(row(), memberships, viewer, { safety: false }),
      ).not.toHaveProperty("emergencyContacts");
    }
  });

  it("gives a captain the captain columns and never an ID or bank number", () => {
    const shaped = shapeUser(row(), memberships, captain, { safety: true });

    expect(shaped).toMatchObject({
      duesPaid: true,
      skills: ["welding"],
      emergencyContacts: [expect.objectContaining({ name: "Ada" })],
    });
    for (const key of [
      "passport",
      "saId",
      "eft",
      "passportEncrypted",
      "saIdEncrypted",
      "eftDetailsEncrypted",
      "authUserId",
    ]) {
      expect(shaped).not.toHaveProperty(key);
    }
  });

  it("gives a member their own columns, still without the ID numbers", () => {
    const shaped = shapeUser(
      row({ aiDataConsent: false }),
      memberships,
      { campUserId: SUBJECT, viewerRank: "camp_member" },
      { safety: true },
    );
    expect(shaped).toMatchObject({
      emergencyContacts: [expect.objectContaining({ name: "Ada" })],
      duesPaid: true,
    });
    expect(shaped).not.toHaveProperty("passport");
  });
});

describe("sensitiveReadEvents", () => {
  it("records a lead's read of contacts with the lead basis, marked as Claude", () => {
    const shaped = shapeUser(row(), memberships, lead, { safety: true });
    expect(sensitiveReadEvents(shaped, lead)).toEqual([
      {
        actorId: CALLER,
        action: "safety.emergency_contacts.view",
        target: SUBJECT,
        metadata: { basis: "team_lead", via: "mcp" },
      },
    ]);
  });

  it("records a captain's read with the captain basis", () => {
    const shaped = shapeUser(row(), memberships, captain, { safety: true });
    expect(sensitiveReadEvents(shaped, captain)).toEqual([
      expect.objectContaining({ metadata: { basis: "captain", via: "mcp" } }),
    ]);
  });

  it("owes nothing for no contacts, for a member, or for the caller's own record", () => {
    const none = shapeUser(
      row({ emergencyContacts: null }),
      memberships,
      captain,
      { safety: true },
    );
    expect(sensitiveReadEvents(none, captain)).toEqual([]);
    expect(
      sensitiveReadEvents(
        shapeUser(row(), memberships, member, { safety: true }),
        member,
      ),
    ).toEqual([]);
    const self = { campUserId: SUBJECT, viewerRank: "camp_member" as const };
    expect(
      sensitiveReadEvents(
        shapeUser(row(), memberships, self, { safety: true }),
        self,
      ),
    ).toEqual([]);
  });
});
