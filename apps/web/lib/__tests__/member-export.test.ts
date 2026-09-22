import { beforeEach, describe, expect, it, vi } from "vitest";

// Building the member export: only the data the viewer's columns need is
// fetched, an unreadable ID is marked, and the audit row is written before the
// file is handed over (and its failure fails the export).

vi.mock("server-only", () => ({}));
vi.mock("@camp404/db/audit", () => ({ appendAuditEvent: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({ decryptField: vi.fn() }));
vi.mock("@camp404/db/member-export", () => ({
  getMemberExportExtras: vi.fn(),
}));
vi.mock("../roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("../camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  teamLabelMap: vi.fn(() => ({})),
}));
vi.mock("../questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(async () => ({
    version: "t",
    pages: [],
  })),
}));
vi.mock("../test-mode", () => ({
  isE2ETestMode: () => false,
  usesTestStore: () => false,
}));

import { appendAuditEvent } from "@camp404/db/audit";
import { decryptField } from "@camp404/db/crypto";
import { getMemberExportExtras } from "@camp404/db/member-export";
import { getCampManagementRoster } from "../roster";
import { buildMemberExport } from "../member-export";

const MEMBER = {
  id: "m1",
  displayName: "Nova",
  handle: null,
  rank: "member",
  approvalStatus: "approved",
  isLead: false,
  teams: [],
  duesPaid: false,
  membershipTier: null,
  onboardingComplete: true,
  pendingRequiredActions: 0,
  intendsToDrive: false,
  driverProfileComplete: false,
  country: null,
  createdAt: new Date("2026-03-01T10:00:00Z"),
  email: "nova@example.com",
};

const EXTRAS = {
  userId: "m1",
  emergencyContacts: null,
  dietaryAllergies: null,
  dietaryDislikes: null,
  dietaryNotes: null,
  allergies: null,
  isAnaphylactic: null,
  notes: null,
  passportEncrypted: "cipher",
  saIdEncrypted: null,
  arrivalAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCampManagementRoster).mockResolvedValue([MEMBER] as never);
  vi.mocked(getMemberExportExtras).mockResolvedValue([EXTRAS] as never);
  vi.mocked(decryptField).mockImplementation((stored) =>
    stored
      ? { state: "unreadable", value: null }
      : { state: "absent", value: null },
  );
});

describe("buildMemberExport", () => {
  it("fetches no private data and no email for a member", async () => {
    const file = await buildMemberExport({ userId: "u1", rank: "camp_member" });

    expect(getCampManagementRoster).toHaveBeenCalledWith({
      includeEmail: false,
    });
    expect(getMemberExportExtras).not.toHaveBeenCalled();
    expect(file.content).not.toContain("nova@example.com");
    // Approval is a member column since the owner's 2026-09-22 ruling; the
    // join date, email, dues and ID are still captain-only.
    expect(file.content.split("\r\n")[0]).toBe(
      "\uFEFFName,Handle,Rank,Teams,Country,Approval",
    );
  });

  it("leaves declined sign-ups out of a non-captain's file, and keeps them in a captain's", async () => {
    vi.mocked(getCampManagementRoster).mockResolvedValue([
      MEMBER,
      { ...MEMBER, id: "m2", displayName: "Rex", approvalStatus: "rejected" },
    ] as never);

    const member = await buildMemberExport({
      userId: "u1",
      rank: "camp_member",
    });
    expect(member.content).toContain("Nova");
    expect(member.content).not.toContain("Rex");
    // The audit row counts the rows that actually went in the file.
    expect(appendAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ rows: 1 }),
      }),
    );

    const captain = await buildMemberExport({ userId: "c1", rank: "captain" });
    expect(captain.content).toContain("Rex");
    expect(appendAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ rows: 2 }),
      }),
    );
  });

  it("fetches safety data but no ID or email for a team lead", async () => {
    await buildMemberExport({ userId: "u1", rank: "team_lead" });

    expect(getCampManagementRoster).toHaveBeenCalledWith({
      includeEmail: false,
    });
    expect(getMemberExportExtras).toHaveBeenCalledWith({
      safety: true,
      captain: false,
    });
  });

  it("gives a captain everything, with an unreadable ID marked, and audits it first", async () => {
    const order: string[] = [];
    vi.mocked(appendAuditEvent).mockImplementation(async () => {
      order.push("audit");
    });

    const file = await buildMemberExport({ userId: "cap-1", rank: "captain" });
    order.push("returned");

    expect(getCampManagementRoster).toHaveBeenCalledWith({
      includeEmail: true,
    });
    expect(getMemberExportExtras).toHaveBeenCalledWith({
      safety: true,
      captain: true,
    });
    expect(file.content).toContain("nova@example.com");
    expect(file.content).toContain("Passport,unreadable");
    expect(order).toEqual(["audit", "returned"]);
    expect(appendAuditEvent).toHaveBeenCalledWith({
      actorId: "cap-1",
      action: "member.export",
      metadata: {
        rank: "captain",
        columns: expect.arrayContaining(["email", "id_number"]),
        rows: 1,
      },
    });
  });

  it("fails the export when the audit row cannot be written", async () => {
    vi.mocked(appendAuditEvent).mockRejectedValue(new Error("db down"));

    await expect(
      buildMemberExport({ userId: "cap-1", rank: "captain" }),
    ).rejects.toThrow("db down");
  });
});
