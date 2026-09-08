import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamsConfig } from "@camp404/db/camp-config";

// The server-side half of Phase 2: the captain gate, Zod boundary, and the
// last-active-team guard (which runs INSIDE the locked transform, so it can't be
// reached via the E2E test store's facade). We mock auth/users to drive the gate
// and mutateTeamsConfig to run the supplied transform against a controlled
// config — exactly the "mock the deps" pattern the questionnaire actions test
// uses. requireClearance/deriveViewerRank (@camp404/core) and the pure
// transforms (@camp404/db/camp-config) run for real.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("@/lib/camp-config", () => ({ mutateTeamsConfig: vi.fn() }));
vi.mock("@camp404/db/cycle-rollover", () => ({ advanceCycle: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  advanceCycleAction,
  moveTeamAction,
  renameTeamAction,
  setTeamArchivedAction,
} from "./actions";
import { advanceCycle } from "@camp404/db/cycle-rollover";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { mutateTeamsConfig } from "@/lib/camp-config";

function asCaptain() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-cap",
    primaryEmail: "cap@example.com",
    displayName: "Cap",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "cap-1",
    rank: "captain",
  } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
}

// Make the mocked writer actually run the transform against `config`, so the
// in-lock guards (assertStableTeamKeys, last-active) execute under test.
function writerOver(config: TeamsConfig) {
  vi.mocked(mutateTeamsConfig).mockImplementation(
    async (transform) => transform(config),
  );
}

const threeActive: TeamsConfig = {
  teams: [
    { key: "kitchen", label: "Kitchen", order: 0, archived: false },
    { key: "structures", label: "Structures", order: 1, archived: false },
    { key: "art_and_activities", label: "Art", order: 2, archived: false },
  ],
};
const twoActive: TeamsConfig = {
  teams: [
    { key: "kitchen", label: "Kitchen", order: 0, archived: false },
    { key: "structures", label: "Structures", order: 1, archived: false },
  ],
};
const oneActive: TeamsConfig = {
  teams: [
    { key: "kitchen", label: "Kitchen", order: 0, archived: false },
    { key: "structures", label: "Structures", order: 1, archived: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("camp-settings actions — captain gate", () => {
  it("rejects a signed-out caller without writing", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null as never);
    const result = await renameTeamAction("kitchen", "Cuisine");
    expect(result).toEqual({ ok: false, error: "Not signed in." });
    expect(mutateTeamsConfig).not.toHaveBeenCalled();
  });

  it("rejects a non-captain without writing", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-m",
      primaryEmail: "m@example.com",
      displayName: "M",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({ rank: "member" } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(true);
    const result = await setTeamArchivedAction("kitchen", true);
    expect(result).toEqual({ ok: false, error: "Captain access only." });
    expect(mutateTeamsConfig).not.toHaveBeenCalled();
  });

  it("rejects a captain still awaiting approval without writing", async () => {
    // A captain-rank but not-yet-approved account is bounced from the page; the
    // action must refuse it too (it's a directly-reachable POST endpoint).
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-cap",
      primaryEmail: "cap@example.com",
      displayName: "Cap",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({ rank: "captain" } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(false);
    const result = await renameTeamAction("kitchen", "Cuisine");
    expect(result).toEqual({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(mutateTeamsConfig).not.toHaveBeenCalled();
  });
});

describe("renameTeamAction", () => {
  beforeEach(asCaptain);

  it("rejects an empty/whitespace label without writing", async () => {
    const result = await renameTeamAction("kitchen", "   ");
    expect(result.ok).toBe(false);
    expect(mutateTeamsConfig).not.toHaveBeenCalled();
  });

  it("trims and applies a valid rename through the writer", async () => {
    writerOver(twoActive);
    const result = await renameTeamAction("kitchen", "  Cuisine  ");
    expect(result).toEqual({ ok: true });
    // The transform handed to the writer renames the right team with a trimmed label.
    const transform = vi.mocked(mutateTeamsConfig).mock.calls[0]![0];
    const next = transform(twoActive);
    expect(next.teams.find((t) => t.key === "kitchen")?.label).toBe("Cuisine");
  });
});

describe("moveTeamAction", () => {
  beforeEach(asCaptain);

  it("rejects an invalid direction without writing", async () => {
    const result = await moveTeamAction("kitchen", "sideways" as never);
    expect(result.ok).toBe(false);
    expect(mutateTeamsConfig).not.toHaveBeenCalled();
  });

  it("applies a valid move through the writer", async () => {
    writerOver(twoActive);
    const result = await moveTeamAction("structures", "up");
    expect(result).toEqual({ ok: true });
    const transform = vi.mocked(mutateTeamsConfig).mock.calls[0]![0];
    expect(transform(twoActive).teams.map((t) => t.key)).toEqual([
      "structures",
      "kitchen",
    ]);
  });
});

describe("setTeamArchivedAction — minimum-active-teams guard", () => {
  beforeEach(asCaptain);

  it("refuses to archive below two active teams (guard runs in the locked transform)", async () => {
    writerOver(twoActive); // archiving either would leave only one active
    const result = await setTeamArchivedAction("kitchen", true);
    expect(result).toEqual({
      ok: false,
      error: "At least two teams must stay active.",
    });
  });

  it("archives when at least two teams stay active", async () => {
    writerOver(threeActive);
    const result = await setTeamArchivedAction("kitchen", true);
    expect(result).toEqual({ ok: true });
    expect(mutateTeamsConfig).toHaveBeenCalledTimes(1);
  });

  it("always allows unarchiving (can't reduce the active count)", async () => {
    writerOver(oneActive);
    const result = await setTeamArchivedAction("structures", false);
    expect(result).toEqual({ ok: true });
  });
});

// --- advanceCycleAction: the gate, the boundary, and the type-to-confirm ----
// The transaction itself is covered by the PGlite suite in packages/db; what
// matters here is that a mistyped confirmation, a signed-out caller, or a
// non-captain never reaches it.

const report = {
  plan: {},
  to: { number: 2, label: "2027", startedAt: "x", endedAt: null },
  reGated: [],
  duesCleared: [],
  announcementBroadcastId: null,
  auditLogId: "audit-1",
};

describe("advanceCycleAction", () => {
  it("rejects a non-captain without advancing anything", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-m",
      primaryEmail: "m@example.com",
      displayName: "M",
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({ rank: "member" } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(true);

    const result = await advanceCycleAction({ label: "2027", confirm: "2027" });
    expect(result).toEqual({ ok: false, error: "Captain access only." });
    expect(advanceCycle).not.toHaveBeenCalled();
  });

  it("refuses when the confirmation doesn't match the name", async () => {
    asCaptain();
    const result = await advanceCycleAction({ label: "2027", confirm: "2026" });
    expect(result.ok).toBe(false);
    expect(advanceCycle).not.toHaveBeenCalled();
  });

  it("refuses an unnamed year", async () => {
    asCaptain();
    const result = await advanceCycleAction({ label: "   ", confirm: "   " });
    expect(result).toEqual({ ok: false, error: "Give the new year a name." });
    expect(advanceCycle).not.toHaveBeenCalled();
  });

  it("passes the trimmed label, the actor, and the levers through", async () => {
    asCaptain();
    vi.mocked(advanceCycle).mockResolvedValue({ ok: true, report } as never);

    const result = await advanceCycleAction({
      label: "  2027  ",
      confirm: "2027",
      resetDues: true,
      announcement: { title: "New year", body: "Off we go." },
    });

    expect(advanceCycle).toHaveBeenCalledWith({
      label: "2027",
      actorUserId: "cap-1",
      resetDues: true,
      announcement: { title: "New year", body: "Off we go." },
    });
    expect(result).toEqual({ ok: true, report });
  });

  it("defaults the optional levers off", async () => {
    asCaptain();
    vi.mocked(advanceCycle).mockResolvedValue({ ok: true, report } as never);
    await advanceCycleAction({ label: "2027", confirm: "2027" });
    expect(advanceCycle).toHaveBeenCalledWith(
      expect.objectContaining({ resetDues: false, announcement: null }),
    );
  });

  it("turns the loser of a race into a sentence a captain can act on", async () => {
    asCaptain();
    vi.mocked(advanceCycle).mockResolvedValue({
      ok: false,
      reason: "already-advanced",
    } as never);
    const result = await advanceCycleAction({ label: "2027", confirm: "2027" });
    expect(result).toEqual({
      ok: false,
      error:
        "The camp has already started that year. Reload the page to see where it is now.",
    });
  });

  it("refuses an announcement with no words in it", async () => {
    asCaptain();
    const result = await advanceCycleAction({
      label: "2027",
      confirm: "2027",
      announcement: { title: "New year", body: "  " },
    });
    expect(result).toEqual({
      ok: false,
      error: "Write something for the announcement.",
    });
    expect(advanceCycle).not.toHaveBeenCalled();
  });
});
