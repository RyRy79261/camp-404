import { describe, it, expect } from "vitest";
import { splitAudience, type AudienceData } from "@camp404/db/recipients";

const data: AudienceData = {
  members: [
    {
      id: "u1",
      isSystem: false,
      sanitised: false,
      approvalStatus: "approved",
    },
    {
      id: "u2",
      isSystem: false,
      sanitised: false,
      approvalStatus: "approved",
    },
    {
      id: "u3",
      isSystem: false,
      sanitised: false,
      approvalStatus: "approved",
    },
    {
      id: "sys",
      isSystem: true,
      sanitised: false,
      approvalStatus: "approved",
    },
    {
      id: "gone",
      isSystem: false,
      sanitised: true,
      approvalStatus: "approved",
    },
  ],
  memberships: [
    { userId: "u1", team: "kitchen", isLead: true },
    { userId: "u2", team: "kitchen", isLead: false },
    { userId: "u3", team: "structures", isLead: false },
  ],
  driverUserIds: ["u2", "gone"],
  targetUserIds: ["u3", "sys"],
  notComingUserIds: [],
};

describe("splitAudience", () => {
  it("everyone = real members minus the sender", () => {
    expect(
      splitAudience(
        { scope: "everyone", team: null },
        data,
        "u1",
      ).reaches.sort(),
    ).toEqual(["u2", "u3"]);
  });

  it("excludes system actors and sanitised accounts everywhere", () => {
    const all = splitAudience(
      { scope: "everyone", team: null },
      data,
      null,
    ).reaches;
    expect(all).not.toContain("sys");
    expect(all).not.toContain("gone");
  });

  it("team filters by team membership", () => {
    expect(
      splitAudience(
        { scope: "team", team: "kitchen" },
        data,
        null,
      ).reaches.sort(),
    ).toEqual(["u1", "u2"]);
  });

  it("a team-scoped broadcast with no team set reaches nobody", () => {
    expect(
      splitAudience({ scope: "team", team: null }, data, null).reaches,
    ).toEqual([]);
  });

  it("team_leads = users who lead at least one team", () => {
    expect(
      splitAudience({ scope: "team_leads", team: null }, data, null).reaches,
    ).toEqual(["u1"]);
  });

  it("drivers excludes sanitised accounts", () => {
    expect(
      splitAudience({ scope: "drivers", team: null }, data, null).reaches,
    ).toEqual(["u2"]); // "gone" is sanitised → dropped
  });

  it("individual uses broadcast_targets, excluding system actors", () => {
    expect(
      splitAudience({ scope: "individual", team: null }, data, null).reaches,
    ).toEqual(["u3"]); // "sys" is a system actor → dropped
  });

  it("de-duplicates and drops the sender", () => {
    const dupes: AudienceData = { ...data, targetUserIds: ["u1", "u1", "u2"] };
    expect(
      splitAudience(
        { scope: "individual", team: null },
        dupes,
        "u2",
      ).reaches.sort(),
    ).toEqual(["u1"]);
  });
});
