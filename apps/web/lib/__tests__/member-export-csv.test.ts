import { describe, expect, it } from "vitest";
import { memberExportColumnsFor } from "@camp404/core";
import type { CampManagementMember } from "@camp404/db/roster";
import {
  memberExportCells,
  memberExportFilename,
  type MemberExportExtra,
} from "../member-export-csv";

// The words in the member export, per rank. Which columns a rank gets is
// @camp404/core's test; this pins what each cell says.

function member(
  over: Partial<CampManagementMember> = {},
): CampManagementMember {
  return {
    id: "m1",
    displayName: "Nova Reyes",
    handle: "nova",
    rank: "member",
    approvalStatus: "approved",
    isLead: true,
    teams: ["kitchen", "structures"],
    duesPaid: true,
    membershipTier: null,
    onboardingComplete: true,
    pendingRequiredActions: 0,
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: "ZA",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    email: "nova@example.com",
    ...over,
  };
}

const EXTRA: MemberExportExtra = {
  emergencyContacts: [
    { name: "Sam", phone: "+27 82 000 0000", relationship: "Sister" },
  ],
  allergies: ["Peanuts", "shellfish"],
  anaphylactic: true,
  dislikes: ["Coriander"],
  dietaryNotes: ["Carries an EpiPen."],
  idType: "sa_id",
  idNumber: "8001015009087",
  arrivalAt: new Date("2026-04-27T08:30:00Z"),
};

const teamLabels = { kitchen: "Cuisine", structures: "Structures" };

function fileFor(
  rank: "camp_member" | "team_lead" | "captain",
  extra: MemberExportExtra | null = EXTRA,
) {
  return memberExportCells({
    columns: memberExportColumnsFor(rank),
    members: [member()],
    extras: new Map(extra ? [["m1", extra]] : []),
    teamLabels,
  });
}

describe("memberExportCells", () => {
  it("gives a member the roster's words — approval standing included — and nothing else", () => {
    expect(fileFor("camp_member")).toEqual([
      ["Name", "Telegram", "Rank", "Teams", "Country", "Approval"],
      [
        "Nova Reyes",
        "@nova",
        "Team Lead",
        "Cuisine; Structures",
        "South Africa",
        "Approved",
      ],
    ]);
  });

  // Every rank's file carries the Approval column, so the name means all three.
  // The loop also checks the word MOVES with the standing: an approved member
  // must not read "Pending", or the assertion would pass on a constant.
  it.each(["camp_member", "team_lead", "captain"] as const)(
    "says Pending for an applicant and Approved for a member, in a %s's file",
    (rank) => {
      const wordFor = (
        approvalStatus: CampManagementMember["approvalStatus"],
      ) => {
        const [header, row] = memberExportCells({
          columns: memberExportColumnsFor(rank),
          members: [member({ approvalStatus })],
          extras: new Map(),
          teamLabels,
        });
        const at = header!.indexOf("Approval");
        expect(at).toBeGreaterThanOrEqual(0);
        return row![at];
      };

      expect(wordFor("pending")).toBe("Pending");
      expect(wordFor("approved")).toBe("Approved");
    },
  );

  it("writes a team lead's safety columns as a person reads them", () => {
    const [header, row] = fileFor("team_lead");
    const at = (h: string) => row![header!.indexOf(h)];
    expect(at("Emergency contact 1")).toBe("Sam (Sister), +27 82 000 0000");
    expect(at("Emergency contact 2")).toBe("");
    expect(at("Allergies")).toBe("Peanuts; shellfish");
    expect(at("Anaphylactic")).toBe("Yes");
    expect(at("Food dislikes")).toBe("Coriander");
    expect(at("Dietary notes")).toBe("Carries an EpiPen.");
  });

  it("gives a captain email, the ID, arrival in camp time, dues and approval", () => {
    const [header, row] = fileFor("captain");
    const at = (h: string) => row![header!.indexOf(h)];
    expect(at("Email")).toBe("nova@example.com");
    expect(at("ID type")).toBe("SA ID");
    expect(at("ID number")).toBe("8001015009087");
    // 08:30 UTC is 10:30 in South Africa.
    expect(at("Arrival")).toContain("10:30");
    expect(at("Dues paid")).toBe("Yes");
    expect(at("Approval")).toBe("Approved");
    expect(at("Joined")).toContain("2026");
  });

  it("says unreadable for an ID that could not be decrypted", () => {
    const [header, row] = fileFor("captain", {
      ...EXTRA,
      idNumber: "unreadable",
    });
    expect(row![header!.indexOf("ID number")]).toBe("unreadable");
  });

  it("leaves safety cells blank for a member with no data on file", () => {
    const [header, row] = fileFor("team_lead", null);
    expect(row![header!.indexOf("Anaphylactic")]).toBe("");
    expect(row![header!.indexOf("Emergency contact 1")]).toBe("");
  });
});

describe("memberExportFilename", () => {
  it("dates the file in camp time", () => {
    // 23:30 UTC on the 15th is already the 16th in South Africa.
    expect(memberExportFilename(new Date("2026-09-15T23:30:00Z"))).toBe(
      "camp-404-members-2026-09-16.csv",
    );
  });
});
