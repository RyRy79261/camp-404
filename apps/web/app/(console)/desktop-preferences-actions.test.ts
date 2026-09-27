// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MemberGate from "@/lib/member-gate";

// The display preferences' two write paths (issues #289 and #290). Each is
// reachable by a direct POST, so it checks the caller itself: only a member
// with a desktop that is not held, only their own choices (never the seen
// time), and only their own row.

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
import {
  markWelcomeSeenAction,
  saveDesktopPreferencesAction,
} from "./desktop-preferences-actions";

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

beforeEach(() => testStore.reset());
afterEach(() => vi.clearAllMocks());

describe("saveDesktopPreferencesAction", () => {
  it("saves the signed-in member's choice to their own row", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(me);

    expect(
      await saveDesktopPreferencesAction({ theme: "calm", biggerText: true }),
    ).toEqual({ ok: true });
    expect(testStore.getDesktopPreferences(me.id)).toMatchObject({
      theme: "calm",
      biggerText: true,
      effectsOff: false,
    });
    expect(testStore.getDesktopPreferences(other.id).theme).toBe("night");
  });

  it("refuses a user id, a seen time or an unknown theme, and writes nothing", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(me);

    for (const bad of [
      { theme: "calm", userId: other.id },
      { welcomeSeenAt: "2026-09-27T08:00:00.000Z" },
      { theme: "neon" },
      {},
      "calm",
    ]) {
      expect(await saveDesktopPreferencesAction(bad)).toEqual({
        ok: false,
        error: "That display setting couldn't be saved.",
      });
    }
    expect(testStore.getDesktopPreferences(me.id)).toEqual(
      testStore.getDesktopPreferences(other.id),
    );
    expect(testStore.getDesktopPreferences(me.id).theme).toBe("night");
  });

  it("refuses a signed-out visitor", async () => {
    vi.mocked(resolveMemberState).mockResolvedValue({ kind: "signed_out" });
    expect((await saveDesktopPreferencesAction({ theme: "calm" })).ok).toBe(
      false,
    );
  });

  it("refuses while a blocking questionnaire holds the member", async () => {
    const me = makeMember("me");
    asMember(me, { reason: "questionnaire", href: "/questionnaires/q" });
    expect((await saveDesktopPreferencesAction({ theme: "calm" })).ok).toBe(
      false,
    );
    expect(testStore.getDesktopPreferences(me.id).theme).toBe("night");
  });

  it("lets an applicant waiting for approval choose how their desktop looks", async () => {
    const me = testStore.createUser({
      authUserId: "auth-new",
      displayName: "New",
      inviteCode: "seed",
      approvalStatus: "pending",
    });
    asMember(me, { reason: "approval", href: "/pending-approval" });
    expect(await saveDesktopPreferencesAction({ effectsOff: true })).toEqual({
      ok: true,
    });
  });
});

describe("markWelcomeSeenAction", () => {
  it("stamps the member's own row, and keeps their other choices", async () => {
    const me = makeMember("me");
    const other = makeMember("other");
    asMember(me);
    await saveDesktopPreferencesAction({ theme: "high-contrast" });

    expect(await markWelcomeSeenAction()).toEqual({ ok: true });
    const prefs = testStore.getDesktopPreferences(me.id);
    expect(prefs.welcomeSeenAt).not.toBeNull();
    expect(prefs.theme).toBe("high-contrast");
    expect(testStore.getDesktopPreferences(other.id).welcomeSeenAt).toBeNull();
  });

  it("refuses a rejected applicant, who has no desktop", async () => {
    const me = testStore.createUser({
      authUserId: "auth-no",
      displayName: "No",
      inviteCode: "seed",
      approvalStatus: "rejected",
    });
    asMember(me, { reason: "approval", href: "/pending-approval" });
    expect((await markWelcomeSeenAction()).ok).toBe(false);
    expect(testStore.getDesktopPreferences(me.id).welcomeSeenAt).toBeNull();
  });

  it("goes with the layout when the account is erased", async () => {
    const me = makeMember("me");
    asMember(me);
    await saveDesktopPreferencesAction({ theme: "calm" });
    await markWelcomeSeenAction();
    testStore.deleteDesktopLayout(me.id);
    expect(testStore.getDesktopPreferences(me.id).theme).toBe("night");
    expect(testStore.getDesktopPreferences(me.id).welcomeSeenAt).toBeNull();
  });
});
