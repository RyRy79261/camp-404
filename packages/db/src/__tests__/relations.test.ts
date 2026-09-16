import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { createInviteCode } from "../invite-codes";
import { getReferralRoster } from "../relations";

// The family tree's "who invited who" roster, on real rows.

describe("getReferralRoster", () => {
  const h = useTestDb();

  it("links each member to who invited them and leaves out the system account", async () => {
    const ada = await makeUser(h.db(), { displayName: "Ada" });
    await createInviteCode({
      code: "ada-one",
      createdByUserId: ada.id,
      note: null,
      maxUses: 1,
      assignedRank: null,
      requiresApproval: true,
    });
    const bo = await makeUser(h.db(), {
      displayName: "Bo",
      inviteCode: "ada-one",
    });
    await makeUser(h.db(), { displayName: "Camp 404", isSystem: true });

    const roster = await getReferralRoster();

    expect(roster.map((r) => r.displayName)).toEqual(["Ada", "Bo"]);
    expect(roster.find((r) => r.id === bo.id)?.inviterId).toBe(ada.id);
    expect(roster.find((r) => r.id === ada.id)?.inviterId).toBeNull();
  });
});
