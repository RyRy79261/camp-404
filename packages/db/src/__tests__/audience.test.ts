import { describe, expect, it } from "vitest";
import {
  computeAudience,
  type AudienceData,
  type BroadcastScope,
} from "../audience";
import { broadcastScopeEnum } from "../schema";

// The scope switch used to end in `default: ids = []`, which would have
// swallowed a newly-added broadcastScopeEnum member as a send that silently
// reached nobody. Half the guard is COMPILE-TIME and cannot be asserted from a
// test: `BroadcastScope` is derived from the enum and the default arm assigns
// `broadcast.scope` to `never`, so a sixth member fails `tsc`. What is testable
// is the runtime half — every real scope resolves, and anything else throws.

const data: AudienceData = {
  members: [
    { id: "u1", isSystem: false, sanitised: false, approvalStatus: "approved" },
    { id: "u2", isSystem: false, sanitised: false, approvalStatus: "approved" },
    { id: "u3", isSystem: false, sanitised: false, approvalStatus: "approved" },
  ],
  memberships: [
    { userId: "u1", team: "kitchen", isLead: true },
    { userId: "u2", team: "kitchen", isLead: false },
  ],
  driverUserIds: ["u3"],
  targetUserIds: ["u2"],
};

describe("computeAudience — scope exhaustiveness", () => {
  it("resolves every broadcastScopeEnum member without throwing", () => {
    // Iterates the DB enum itself, not a hand-written list: a member added to
    // the enum and to no case arm fails here as well as at compile time.
    expect(broadcastScopeEnum.enumValues.length).toBeGreaterThan(0);
    for (const scope of broadcastScopeEnum.enumValues) {
      expect(() =>
        computeAudience({ scope, team: "kitchen" }, data, null),
      ).not.toThrow();
    }
  });

  it("fails loudly on an unhandled scope instead of resolving to nobody", () => {
    // THE REFUSED CASE: the cast simulates a scope that reached the switch
    // without a case arm — an enum grown past the union, or the
    // `as BroadcastScope` laundering in activations.ts. Silence was the defect.
    expect(() =>
      computeAudience(
        { scope: "captains_only" as BroadcastScope, team: null },
        data,
        null,
      ),
    ).toThrow(/Unhandled broadcast scope: captains_only/);
  });
});

describe("computeAudience — applicants are not members yet", () => {
  // Owner's call (2026-09-16): group audiences are approved members only. A
  // pending or rejected applicant must not get the full-screen announcement
  // takeover or a camp-wide questionnaire gate.
  const camp: AudienceData = {
    members: [
      {
        id: "member",
        isSystem: false,
        sanitised: false,
        approvalStatus: "approved",
      },
      {
        id: "pending",
        isSystem: false,
        sanitised: false,
        approvalStatus: "pending",
      },
      {
        id: "rejected",
        isSystem: false,
        sanitised: false,
        approvalStatus: "rejected",
      },
    ],
    memberships: [
      { userId: "member", team: "kitchen", isLead: true },
      { userId: "pending", team: "kitchen", isLead: true },
    ],
    driverUserIds: ["member", "rejected"],
    targetUserIds: ["pending"],
  };

  it("leaves pending and rejected applicants out of every group audience", () => {
    for (const scope of [
      "everyone",
      "team",
      "team_leads",
      "drivers",
    ] as const) {
      expect(computeAudience({ scope, team: "kitchen" }, camp, null)).toEqual([
        "member",
      ]);
    }
  });

  it("still reaches a person a captain picked by name", () => {
    expect(
      computeAudience({ scope: "individual", team: null }, camp, null),
    ).toEqual(["pending"]);
  });
});
