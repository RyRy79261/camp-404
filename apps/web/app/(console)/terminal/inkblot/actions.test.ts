// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MemberGate from "@/lib/member-gate";

// INKBLOT's shared board. Both actions are reachable by a direct POST, so
// each checks the caller itself: only a member with the full desktop (the
// game page's own gate), only a run inside the board's bounds, only under
// their own id, and not without end.

vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => true,
  usesTestStore: () => true,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("@/lib/member-gate", async (importActual) => ({
  ...(await importActual<typeof MemberGate>()),
  resolveMemberState: vi.fn(),
}));

import { resolveMemberState, type MemberState } from "@/lib/member-gate";
import { testStore } from "@/lib/test-store";
import type { CampUser } from "@/lib/users";
import { resetRateLimitsForE2E } from "@/lib/rate-limit";
import { getInkblotBoardAction, recordInkblotRunAction } from "./actions";

const AUTH = {
  id: "auth-me",
  primaryEmail: "me@example.com",
  displayName: "Me",
  emailVerified: true,
};

function campUserOf(user: ReturnType<typeof testStore.createUser>): CampUser {
  return {
    id: user.id,
    authUserId: user.authUserId,
    displayName: user.displayName,
    profileImageUrl: null,
    inviteCode: user.inviteCode,
    rank: user.rank,
    approvalStatus: user.approvalStatus,
    approvalDecisionReason: null,
  };
}

function asMember(
  user: ReturnType<typeof testStore.createUser>,
  block: Extract<MemberState, { kind: "member" }>["block"] = null,
) {
  vi.mocked(resolveMemberState).mockResolvedValue({
    kind: "member",
    authUser: AUTH,
    campUser: campUserOf(user),
    block,
  });
}

function makeMember(name: string) {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seed",
  });
}

beforeEach(() => {
  testStore.reset();
  resetRateLimitsForE2E();
});
afterEach(() => vi.clearAllMocks());

describe("recordInkblotRunAction", () => {
  it("puts the run on the camp's board under the signed-in member", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(other);
    await recordInkblotRunAction({ initials: "OTH", durationMs: 20_000 });

    asMember(me);
    const result = await recordInkblotRunAction({
      initials: "ME",
      durationMs: 12_300,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.mine).toMatchObject({
      initials: "ME",
      durationMs: 12_300,
    });
    expect(result.data.board.map((e) => e.initials)).toEqual(["ME", "OTH"]);

    // The same board, read by anyone who may play.
    const board = await getInkblotBoardAction();
    expect(board.ok && board.data.map((e) => e.initials)).toEqual([
      "ME",
      "OTH",
    ]);
  });

  it("refuses a run that names a user id: the run is always the session's", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(me);
    expect(
      (
        await recordInkblotRunAction({
          initials: "ME",
          durationMs: 12_300,
          userId: other.id,
        })
      ).ok,
    ).toBe(false);
    expect(testStore.getInkblotBoard()).toEqual([]);
  });

  it("refuses a time too fast to be real, and writes nothing", async () => {
    asMember(makeMember("me"));
    expect(
      await recordInkblotRunAction({ initials: "ZAP", durationMs: 1_000 }),
    ).toEqual({ ok: false, error: "That time is too fast to be real." });
    expect(testStore.getInkblotBoard()).toEqual([]);
  });

  it("refuses a member whose desktop is held or awaiting approval", async () => {
    const me = makeMember("me");
    for (const block of [
      { reason: "questionnaire", href: "/questionnaires/q" },
      { reason: "approval", href: "/pending-approval" },
    ] as const) {
      asMember(me, block);
      expect(
        (await recordInkblotRunAction({ initials: "ME", durationMs: 9_000 }))
          .ok,
      ).toBe(false);
      expect((await getInkblotBoardAction()).ok).toBe(false);
    }
    expect(testStore.getInkblotBoard()).toEqual([]);
  });

  it("refuses someone signed out", async () => {
    vi.mocked(resolveMemberState).mockResolvedValue({ kind: "signed_out" });
    expect(
      (await recordInkblotRunAction({ initials: "ME", durationMs: 9_000 })).ok,
    ).toBe(false);
  });

  it("stops a member who saves run after run", async () => {
    asMember(makeMember("me"));
    for (let i = 0; i < 30; i++) {
      const r = await recordInkblotRunAction({
        initials: "SPM",
        durationMs: 9_000 + i,
      });
      expect(r.ok).toBe(true);
    }
    expect(
      await recordInkblotRunAction({ initials: "SPM", durationMs: 9_000 }),
    ).toEqual({
      ok: false,
      error: "That's a lot of chaos. Try again in a while.",
    });
  });
});
