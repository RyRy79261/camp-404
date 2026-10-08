import { beforeEach, describe, expect, it, vi } from "vitest";

// The captains' Camp sheet: the member export's captain table as words, with
// each column's group and privacy mark, and one audit row written BEFORE the
// sheet is handed back (its failure fails the sheet).

const testMode = vi.hoisted(() => ({ store: false }));

vi.mock("server-only", () => ({}));
vi.mock("@camp404/db/audit", () => ({ appendAuditEvent: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({ decryptField: vi.fn() }));
vi.mock("@camp404/db/member-export", () => ({
  getMemberExportExtras: vi.fn(),
}));
vi.mock("../roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("../camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  teamLabelMap: vi.fn(() => ({ kitchen: "Kitchen", structures: "Structures" })),
}));
vi.mock("../questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(async () => ({
    version: "t",
    pages: [],
  })),
}));
vi.mock("../test-mode", () => ({
  isE2ETestMode: () => testMode.store,
  usesTestStore: () => testMode.store,
}));

import { AUDIT_ACTION_LABELS } from "@camp404/core";
import { appendAuditEvent } from "@camp404/db/audit";
import { decryptField } from "@camp404/db/crypto";
import { getMemberExportExtras } from "@camp404/db/member-export";
import { getCampManagementRoster } from "../roster";
import { buildCampSheet } from "../camp-sheet";

const MEMBER = {
  id: "m1",
  displayName: "Nova",
  handle: "nova",
  rank: "member",
  approvalStatus: "approved",
  isLead: true,
  teams: ["kitchen", "structures"],
  leadTeams: ["kitchen"],
  duesPaid: true,
  onboardingComplete: true,
  pendingRequiredActions: 0,
  pendingRequiredActionItems: [],
  intendsToDrive: false,
  driverProfileComplete: false,
  country: "ZA",
  participation: "accepted",
  participationIntent: "yes",
  createdAt: new Date("2026-03-01T10:00:00Z"),
  email: "nova@example.com",
};

const EXTRAS = {
  userId: "m1",
  emergencyContacts: [
    { name: "Sam", phone: "+27 82 000 0000", relationship: "Sister" },
  ],
  dietaryAllergies: null,
  dietaryDislikes: null,
  dietaryNotes: null,
  allergies: "Peanuts",
  isAnaphylactic: true,
  notes: null,
  passportEncrypted: null,
  saIdEncrypted: "cipher",
  arrivalAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  testMode.store = false;
  vi.mocked(getCampManagementRoster).mockResolvedValue([
    MEMBER,
    { ...MEMBER, id: "m2", displayName: "Rex", approvalStatus: "rejected" },
  ] as never);
  vi.mocked(getMemberExportExtras).mockResolvedValue([EXTRAS] as never);
  vi.mocked(decryptField).mockImplementation((stored) =>
    stored
      ? { state: "ok", value: "8001015009087" }
      : { state: "absent", value: null },
  );
});

describe("buildCampSheet", () => {
  it("reads the captain's whole table: email, safety data and the ID", async () => {
    await buildCampSheet({ userId: "cap-1" });
    expect(getCampManagementRoster).toHaveBeenCalledWith({
      includeEmail: true,
    });
    expect(getMemberExportExtras).toHaveBeenCalledWith({
      safety: true,
      captain: true,
    });
  });

  it("gives each column its group and privacy mark, and each person their words", async () => {
    const sheet = await buildCampSheet({ userId: "cap-1" });
    const col = (key: string) => sheet.columns.findIndex((c) => c.key === key);

    expect(sheet.columns[col("emergency_contact_1")]).toEqual({
      key: "emergency_contact_1",
      header: "Emergency contact 1",
      group: "safety",
      private: true,
    });
    expect(sheet.columns[col("id_number")]).toMatchObject({
      group: "captains",
      private: true,
    });
    expect(sheet.columns[col("this_year")]).toMatchObject({
      header: "This year",
      group: "who",
      private: false,
    });

    // A captain sees declined sign-ups too, as the captain roster does.
    expect(sheet.rows.map((r) => r.cells[0])).toEqual(["Nova", "Rex"]);
    const nova = sheet.rows[0]!;
    expect(nova.cells[col("teams")]).toBe("Kitchen (lead); Structures");
    expect(nova.cells[col("this_year")]).toBe("Accepted");
    expect(nova.cells[col("emergency_contact_1")]).toBe(
      "Sam (Sister), +27 82 000 0000",
    );
    expect(nova.cells[col("anaphylactic")]).toBe("Yes");
    expect(nova.cells[col("id_number")]).toBe("8001015009087");
    // What the filters match on travels beside the words.
    expect(nova).toMatchObject({
      id: "m1",
      teams: ["kitchen", "structures"],
      thisYear: "accepted",
    });
    // Words only: no raw roster field rides along.
    expect(Object.keys(nova).sort()).toEqual([
      "cells",
      "id",
      "teams",
      "thisYear",
    ]);
  });

  it("writes one audit row before it hands the sheet back", async () => {
    const order: string[] = [];
    vi.mocked(appendAuditEvent).mockImplementation(async () => {
      order.push("audit");
    });

    const sheet = await buildCampSheet({ userId: "cap-1" });
    order.push("returned");

    expect(order).toEqual(["audit", "returned"]);
    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(appendAuditEvent).toHaveBeenCalledWith({
      actorId: "cap-1",
      action: "member.sheet_viewed",
      metadata: {
        columns: sheet.columns.map((c) => c.key),
        rows: 2,
      },
    });
    expect(AUDIT_ACTION_LABELS["member.sheet_viewed"]).toBe(
      "Opened the camp sheet",
    );
  });

  it("fails when the audit row cannot be written", async () => {
    vi.mocked(appendAuditEvent).mockRejectedValue(new Error("db down"));
    await expect(buildCampSheet({ userId: "cap-1" })).rejects.toThrow(
      "db down",
    );
  });

  it("writes no audit row on the E2E test store, which keeps no audit log", async () => {
    testMode.store = true;
    await buildCampSheet({ userId: "cap-1" });
    expect(appendAuditEvent).not.toHaveBeenCalled();
    expect(getMemberExportExtras).not.toHaveBeenCalled();
  });
});
