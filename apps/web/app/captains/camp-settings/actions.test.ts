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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  moveTeamAction,
  renameTeamAction,
  setTeamArchivedAction,
} from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { mutateTeamsConfig } from "@/lib/camp-config";

function asCaptain() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-cap",
    primaryEmail: "cap@example.com",
    displayName: "Cap",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ rank: "captain" } as never);
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

describe("setTeamArchivedAction — last-active guard", () => {
  beforeEach(asCaptain);

  it("refuses to archive the last active team (guard runs in the locked transform)", async () => {
    writerOver(oneActive); // kitchen is the only active team
    const result = await setTeamArchivedAction("kitchen", true);
    expect(result).toEqual({
      ok: false,
      error: "At least one team must stay active.",
    });
  });

  it("archives when another team stays active", async () => {
    writerOver(twoActive);
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
