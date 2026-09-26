// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MemberGate from "@/lib/member-gate";

// saveDesktopLayoutAction: the one write path of the saved desktop (decision
// 14 B). It is reachable by a direct POST, so it checks the caller itself:
// only a member with a desktop that is not held, only a layout, and only
// their own row, whatever the caller sends.

vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => true,
  usesTestStore: () => true,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("@/lib/member-gate", async (importActual) => ({
  ...(await importActual<typeof MemberGate>()),
  resolveMemberState: vi.fn(),
}));

import type { DesktopLayout } from "@camp404/types";
import { resolveMemberState, type MemberState } from "@/lib/member-gate";
import { testStore } from "@/lib/test-store";
import type { CampUser } from "@/lib/users";
import { saveDesktopLayoutAction } from "./desktop-layout-actions";

const AUTH = {
  id: "auth-me",
  primaryEmail: "me@example.com",
  displayName: "Me",
  emailVerified: true,
};

const LAYOUT: DesktopLayout = {
  cells: { inbox: { c: 2, r: 0 }, "sc-1": { c: 0, r: 3 } },
  items: [{ kind: "shortcut", id: "sc-1", target: "tasks" }],
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

beforeEach(() => testStore.reset());
afterEach(() => vi.clearAllMocks());

describe("saveDesktopLayoutAction", () => {
  it("saves the signed-in member's layout to their own row", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(me);

    expect(await saveDesktopLayoutAction(LAYOUT)).toEqual({ ok: true });
    expect(testStore.getDesktopLayout(me.id)).toEqual(LAYOUT);
    expect(testStore.getDesktopLayout(other.id)).toBeNull();
  });

  it("ignores any user id the caller sends", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(me);

    await saveDesktopLayoutAction({ ...LAYOUT, userId: other.id });
    expect(testStore.getDesktopLayout(other.id)).toBeNull();
    // Only the layout's own fields are stored.
    expect(testStore.getDesktopLayout(me.id)).toEqual(LAYOUT);
  });

  it("refuses what is not a layout and writes nothing", async () => {
    const me = makeMember("me");
    asMember(me);

    const result = await saveDesktopLayoutAction({
      cells: {},
      items: [{ kind: "folder", id: "uf-1", name: "x".repeat(25), items: [] }],
    });
    expect(result).toEqual({
      ok: false,
      error: "Your desktop couldn't be saved.",
    });
    expect(testStore.getDesktopLayout(me.id)).toBeNull();
  });

  it("refuses a signed-out visitor", async () => {
    vi.mocked(resolveMemberState).mockResolvedValue({ kind: "signed_out" });
    const result = await saveDesktopLayoutAction(LAYOUT);
    expect(result.ok).toBe(false);
  });

  it("refuses while a blocking questionnaire holds the member", async () => {
    const me = makeMember("me");
    asMember(me, { reason: "questionnaire", href: "/questionnaires/q" });

    expect((await saveDesktopLayoutAction(LAYOUT)).ok).toBe(false);
    expect(testStore.getDesktopLayout(me.id)).toBeNull();
  });

  it("refuses a rejected applicant, who has no desktop", async () => {
    const me = testStore.createUser({
      authUserId: "auth-no",
      displayName: "No",
      inviteCode: "seed",
      approvalStatus: "rejected",
    });
    asMember(me, { reason: "approval", href: "/pending-approval" });

    expect((await saveDesktopLayoutAction(LAYOUT)).ok).toBe(false);
    expect(testStore.getDesktopLayout(me.id)).toBeNull();
  });

  it("lets an applicant waiting for approval arrange their restricted desktop", async () => {
    const me = testStore.createUser({
      authUserId: "auth-new",
      displayName: "New",
      inviteCode: "seed",
      approvalStatus: "pending",
    });
    asMember(me, { reason: "approval", href: "/pending-approval" });

    expect(await saveDesktopLayoutAction(LAYOUT)).toEqual({ ok: true });
  });
});
