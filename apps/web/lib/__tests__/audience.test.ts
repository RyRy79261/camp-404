import { describe, it, expect } from "vitest";
import { computeAudience, type AudienceData } from "@camp404/db/audience";

const data: AudienceData = {
  members: [
    { id: "u1", isSystem: false, sanitised: false },
    { id: "u2", isSystem: false, sanitised: false },
    { id: "u3", isSystem: false, sanitised: false },
    { id: "sys", isSystem: true, sanitised: false },
    { id: "gone", isSystem: false, sanitised: true },
  ],
  memberships: [
    { userId: "u1", team: "kitchen", isLead: true },
    { userId: "u2", team: "kitchen", isLead: false },
    { userId: "u3", team: "structures", isLead: false },
  ],
  driverUserIds: ["u2", "gone"],
  targetUserIds: ["u3", "sys"],
};

describe("computeAudience", () => {
  it("everyone = real members minus the sender", () => {
    expect(
      computeAudience({ scope: "everyone", team: null }, data, "u1").sort(),
    ).toEqual(["u2", "u3"]);
  });

  it("excludes system actors and sanitised accounts everywhere", () => {
    const all = computeAudience({ scope: "everyone", team: null }, data, null);
    expect(all).not.toContain("sys");
    expect(all).not.toContain("gone");
  });

  it("team filters by team membership", () => {
    expect(
      computeAudience({ scope: "team", team: "kitchen" }, data, null).sort(),
    ).toEqual(["u1", "u2"]);
  });

  it("a team-scoped broadcast with no team set reaches nobody", () => {
    expect(computeAudience({ scope: "team", team: null }, data, null)).toEqual(
      [],
    );
  });

  it("team_leads = users who lead at least one team", () => {
    expect(
      computeAudience({ scope: "team_leads", team: null }, data, null),
    ).toEqual(["u1"]);
  });

  it("drivers excludes sanitised accounts", () => {
    expect(
      computeAudience({ scope: "drivers", team: null }, data, null),
    ).toEqual(["u2"]); // "gone" is sanitised → dropped
  });

  it("individual uses broadcast_targets, excluding system actors", () => {
    expect(
      computeAudience({ scope: "individual", team: null }, data, null),
    ).toEqual(["u3"]); // "sys" is a system actor → dropped
  });

  it("de-duplicates and drops the sender", () => {
    const dupes: AudienceData = { ...data, targetUserIds: ["u1", "u1", "u2"] };
    expect(
      computeAudience({ scope: "individual", team: null }, dupes, "u2").sort(),
    ).toEqual(["u1"]);
  });
});
