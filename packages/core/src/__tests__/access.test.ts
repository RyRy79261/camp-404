import { describe, expect, it } from "vitest";

import {
  canEditBuilderDefinition,
  canViewBuilderDefinition,
  deriveViewerRank,
  hasCampAccess,
  hasClearance,
  isApproved,
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

describe("canViewBuilderDefinition", () => {
  const member = { rank: "camp_member" as const, userId: "m-1" };
  const captain = { rank: "captain" as const, userId: "cap-1" };

  it("shows every camp member every questionnaire, drafts included", () => {
    for (const viewer of [member, captain]) {
      for (const status of ["draft", "published", "unpublished"] as const) {
        expect(
          canViewBuilderDefinition(viewer, { status, createdBy: "x" }),
        ).toBe(true);
      }
    }
  });
});

describe("canEditBuilderDefinition", () => {
  const mine = { createdBy: "me" };
  const theirs = { createdBy: "them" };
  it("lets a captain change any, a team lead only their own", () => {
    expect(
      canEditBuilderDefinition({ rank: "captain", userId: "me" }, theirs),
    ).toBe(true);
    expect(
      canEditBuilderDefinition({ rank: "team_lead", userId: "me" }, mine),
    ).toBe(true);
    expect(
      canEditBuilderDefinition({ rank: "team_lead", userId: "me" }, theirs),
    ).toBe(false);
  });
  it("never a plain member, even the author", () => {
    expect(
      canEditBuilderDefinition({ rank: "camp_member", userId: "me" }, mine),
    ).toBe(false);
    expect(
      canEditBuilderDefinition(
        { rank: "team_lead", userId: "me" },
        { createdBy: null },
      ),
    ).toBe(false);
  });
});
