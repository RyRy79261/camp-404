import { describe, expect, it } from "vitest";

import {
  deriveViewerRank,
  hasCampAccess,
  hasClearance,
  isApproved,
  nextGate,
  rankLevel,
  requireClearance,
} from "../access";

describe("rank ladder", () => {
  it("orders camp_member < team_lead < captain", () => {
    expect(rankLevel("camp_member")).toBe(0);
    expect(rankLevel("team_lead")).toBe(1);
    expect(rankLevel("captain")).toBe(2);
  });

  it("hasClearance is true only at or above the required rank", () => {
    expect(hasClearance("captain", "captain")).toBe(true);
    expect(hasClearance("captain", "camp_member")).toBe(true);
    expect(hasClearance("team_lead", "captain")).toBe(false);
    expect(hasClearance("camp_member", "team_lead")).toBe(false);
  });

  it("derives viewer rank from stored rank + team-lead", () => {
    expect(deriveViewerRank("captain", false)).toBe("captain");
    expect(deriveViewerRank("captain", true)).toBe("captain");
    expect(deriveViewerRank("member", true)).toBe("team_lead");
    expect(deriveViewerRank("member", false)).toBe("camp_member");
  });
});

describe("camp-access + approval gates", () => {
  it("god email always has access and approval", () => {
    expect(hasCampAccess({ inviteCode: null }, true)).toBe(true);
    expect(isApproved({ approvalStatus: "pending" }, true)).toBe(true);
  });

  it("non-god needs a redeemed invite code for access", () => {
    expect(hasCampAccess({ inviteCode: null }, false)).toBe(false);
    expect(hasCampAccess({ inviteCode: "neon-toaster-mongoose" }, false)).toBe(
      true,
    );
  });

  it("non-god needs an approved status", () => {
    expect(isApproved({ approvalStatus: "approved" }, false)).toBe(true);
    expect(isApproved({ approvalStatus: "pending" }, false)).toBe(false);
    expect(isApproved({ approvalStatus: "rejected" }, false)).toBe(false);
  });
});

describe("nextGate", () => {
  const routes = { burner_profile: "/onboarding/questionnaire" };

  it("returns the first blocking, mapped route (oldest first)", () => {
    expect(
      nextGate([{ actionKey: "burner_profile", blocking: true }], routes),
    ).toBe("/onboarding/questionnaire");
  });

  it("skips non-blocking and unmapped actions", () => {
    expect(
      nextGate([{ actionKey: "burner_profile", blocking: false }], routes),
    ).toBeNull();
    expect(nextGate([{ actionKey: "driver_profile", blocking: true }], routes)).toBeNull();
  });

  it("returns null when nothing is pending", () => {
    expect(nextGate([], routes)).toBeNull();
  });
});

describe("requireClearance", () => {
  it("a captain clears every required rank", () => {
    for (const required of ["camp_member", "team_lead", "captain"] as const) {
      expect(requireClearance("captain", required).cleared).toBe(true);
    }
  });

  it("a team_lead clears team_lead and below, not captain", () => {
    expect(requireClearance("team_lead", "camp_member").cleared).toBe(true);
    expect(requireClearance("team_lead", "team_lead").cleared).toBe(true);
    expect(requireClearance("team_lead", "captain").cleared).toBe(false);
  });

  it("a camp_member clears only camp_member", () => {
    expect(requireClearance("camp_member", "camp_member").cleared).toBe(true);
    expect(requireClearance("camp_member", "team_lead").cleared).toBe(false);
    expect(requireClearance("camp_member", "captain").cleared).toBe(false);
  });

  it("echoes the ranks it compared (for CaptainLock / data-gate)", () => {
    expect(requireClearance("team_lead", "captain")).toEqual({
      cleared: false,
      viewerRank: "team_lead",
      requiredRank: "captain",
    });
  });
});
