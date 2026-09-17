import { beforeEach, describe, expect, it, vi } from "vitest";

// The family tree is cut to the viewer on the server: a member's page never
// receives another member's invite code.

vi.mock("@camp404/db/relations", () => ({ getReferralRoster: vi.fn() }));
vi.mock("../test-mode", () => ({ usesTestStore: () => false }));
vi.mock("../test-store", () => ({ testStore: {} }));
vi.mock("../users", () => ({ isTeamLead: vi.fn(async () => false) }));

import { getReferralRoster } from "@camp404/db/relations";
import { getReferralRosterForViewer } from "../relations";
import type { CampUser } from "../users";

const ROSTER = [
  {
    id: "a",
    displayName: "Marlo",
    rank: "captain",
    inviteCode: null,
    inviterId: null,
  },
  {
    id: "b",
    displayName: "Sara",
    rank: "member",
    inviteCode: "neon-toaster",
    inviterId: "a",
  },
  {
    id: "c",
    displayName: "Dust",
    rank: "member",
    inviteCode: "velvet-anvil",
    inviterId: "b",
  },
] as const;

function viewer(id: string, rank: CampUser["rank"]): CampUser {
  return { id, rank } as CampUser;
}

beforeEach(() => {
  vi.mocked(getReferralRoster).mockResolvedValue(ROSTER.map((r) => ({ ...r })));
});

describe("getReferralRosterForViewer", () => {
  it("sends a member only their own invite code", async () => {
    const rows = await getReferralRosterForViewer(viewer("c", "member"));
    expect(rows.map((r) => r.inviteCode)).toEqual([null, null, "velvet-anvil"]);
    expect(rows.map((r) => r.inviterId)).toEqual([null, "a", "b"]);
  });

  it("sends a captain every code", async () => {
    const rows = await getReferralRosterForViewer(viewer("a", "captain"));
    expect(rows.map((r) => r.inviteCode)).toEqual([
      null,
      "neon-toaster",
      "velvet-anvil",
    ]);
  });
});
