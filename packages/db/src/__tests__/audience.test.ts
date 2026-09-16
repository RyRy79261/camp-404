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
    { id: "u1", isSystem: false, sanitised: false },
    { id: "u2", isSystem: false, sanitised: false },
    { id: "u3", isSystem: false, sanitised: false },
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
