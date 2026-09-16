import { beforeEach, describe, expect, it, vi } from "vitest";

// The one read path for a member's emergency contacts: authorise, then read,
// then audit a read by someone else.

vi.mock("@/lib/users", () => ({ getEmergencyContacts: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditReadAfterResponse: vi.fn() }));

import { auditReadAfterResponse } from "@/lib/audit";
import { getEmergencyContacts } from "@/lib/users";
import { resolveSafetyDataForViewer } from "../safety-data";

const CONTACTS = [
  { name: "Ada", phone: "+27 82 555 0199", relationship: "sister" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmergencyContacts).mockResolvedValue(CONTACTS);
});

describe("resolveSafetyDataForViewer", () => {
  it("gives a captain the contacts and records the read", async () => {
    const result = await resolveSafetyDataForViewer(
      { userId: "cap-1", rank: "captain" },
      "member-1",
    );

    expect(result).toEqual({
      allowed: true,
      basis: "captain",
      emergencyContacts: CONTACTS,
    });
    expect(auditReadAfterResponse).toHaveBeenCalledExactlyOnceWith({
      actorId: "cap-1",
      action: "safety.emergency_contacts.view",
      target: "member-1",
      metadata: { basis: "captain" },
    });
  });

  it("gives any team lead the contacts and records the read", async () => {
    const result = await resolveSafetyDataForViewer(
      { userId: "lead-1", rank: "team_lead" },
      "member-1",
    );

    expect(result).toMatchObject({ allowed: true, basis: "team_lead" });
    expect(auditReadAfterResponse).toHaveBeenCalledOnce();
  });

  it("refuses another member without reading anything", async () => {
    const result = await resolveSafetyDataForViewer(
      { userId: "member-2", rank: "camp_member" },
      "member-1",
    );

    expect(result).toEqual({ allowed: false });
    expect(getEmergencyContacts).not.toHaveBeenCalled();
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("records nothing for the member's own read", async () => {
    const result = await resolveSafetyDataForViewer(
      { userId: "member-1", rank: "camp_member" },
      "member-1",
    );

    expect(result).toMatchObject({ allowed: true, basis: "self" });
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("records nothing when there are no contacts to show", async () => {
    vi.mocked(getEmergencyContacts).mockResolvedValue(null);

    await resolveSafetyDataForViewer(
      { userId: "cap-1", rank: "captain" },
      "member-1",
    );

    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });
});
