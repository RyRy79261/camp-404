import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CampConfig from "@/lib/camp-config";
import type * as Notifications from "@/lib/notifications";
import type * as Users from "@/lib/users";

// The bell in the console header and the Notifications tile on Home both open
// the inbox, and both show a count of what is new there. They are drawn in the
// same request, so a member who sees two different numbers is being told two
// different things about the same inbox. These render the real header and the
// real Home page for one member and check the two numbers agree.

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect(${href})`);
  }),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    id: "auth-member",
    primaryEmail: "member@example.com",
  })),
}));
vi.mock("@/lib/bootstrap", () => ({
  isCampBootstrapped: vi.fn(async () => true),
}));
vi.mock("@/lib/member-gate", () => ({ resolveMemberState: vi.fn() }));
vi.mock("@/lib/lifts", () => ({ getMyLift: vi.fn(async () => null) }));
vi.mock("@/lib/sign-in-security", () => ({
  isSignInSecured: vi.fn(async () => true),
}));
vi.mock("@/lib/camp-config", async (importActual) => ({
  ...(await importActual<typeof CampConfig>()),
  getTeamsConfig: vi.fn(async () => ({ teams: [] })),
}));
vi.mock("@/lib/google-calendar", () => ({
  getUpcomingEvents: vi.fn(async () => ({ status: "ok", events: [] })),
}));
// The notices half. By default the real facade (the in-memory test backend
// when E2E_TEST_MODE is on); the mocked cases pin the number.
vi.mock("@/lib/notifications", async (importActual) => {
  const actual = await importActual<typeof Notifications>();
  return {
    ...actual,
    countUnread: vi.fn(actual.countUnread),
    countUnreadByTeam: vi.fn(actual.countUnreadByTeam),
  };
});
vi.mock("@/lib/users", async (importActual) => {
  const actual = await importActual<typeof Users>();
  return {
    ...actual,
    getPendingQuestionnaires: vi.fn(actual.getPendingQuestionnaires),
    getMyTeams: vi.fn(async () => []),
    isTeamLead: vi.fn(async () => false),
  };
});
// The bell's panel fetches only when opened; nothing here opens it.
vi.mock("@/app/(console)/notifications/actions", () => ({
  fetchNotificationPanelAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("../../landing-hero", () => ({ LandingHero: () => null }));
vi.mock("@/components/push/enable-push", () => ({ EnablePush: () => null }));
vi.mock("@/components/push/device-token", () => ({
  forgetDeviceToken: vi.fn(),
}));

import { resolveMemberState } from "@/lib/member-gate";
import { countUnread, countUnreadByTeam } from "@/lib/notifications";
import { testStore } from "@/lib/test-store";
import { getPendingQuestionnaires, type CampUser } from "@/lib/users";
import { ConsoleHeader } from "@/components/console/console-header";
import HomePage from "../page";

const OPEN_FORM = {
  activationId: "act-1",
  title: "Dietary requirements",
  blocking: false,
  dueAt: null,
  createdAt: new Date("2026-09-20T08:00:00Z"),
};

function campMember(over: Partial<CampUser> = {}): CampUser {
  return {
    id: "u-member",
    authUserId: "auth-member",
    displayName: "Nova Member",
    profileImageUrl: null,
    inviteCode: "seed",
    rank: "member",
    approvalStatus: "approved",
    approvalDecisionReason: null,
    ...over,
  };
}

function signedInAs(campUser: CampUser, waiting = false) {
  vi.mocked(resolveMemberState).mockResolvedValue({
    kind: "member",
    authUser: { id: campUser.authUserId, primaryEmail: "member@example.com" },
    campUser,
    block: waiting ? { reason: "approval", href: "/pending-approval" } : null,
  } as Awaited<ReturnType<typeof resolveMemberState>>);
}

/** The number in an accessible name, or 0 for "none" / no count. */
function countIn(name: string): number {
  const match = /(\d+)/.exec(name);
  return match ? Number(match[1]) : 0;
}

/** Render the header and Home for one member; read both numbers. */
async function renderBoth(campUser: CampUser) {
  render(
    <>
      {await ConsoleHeader({ campUser, email: "member@example.com" })}
      {await HomePage()}
    </>,
  );
  const bell = screen.getByRole("button", { name: /^Notifications,/ });
  const tile = screen.getByRole("link", { name: /^Notifications/ });
  return {
    bell: countIn(bell.getAttribute("aria-label") ?? ""),
    tile: countIn(tile.getAttribute("aria-label") ?? ""),
  };
}

afterEach(() => {
  cleanup();
  delete process.env.E2E_TEST_MODE;
});

beforeEach(() => {
  // Back to each mock's own implementation, so a number pinned by one case
  // cannot leak into the test-backend case.
  vi.resetAllMocks();
});

describe("the bell and the Notifications tile", () => {
  it("show the same count for a member with unread notices and an open form", async () => {
    vi.mocked(countUnread).mockResolvedValue(5);
    vi.mocked(countUnreadByTeam).mockResolvedValue({});
    vi.mocked(getPendingQuestionnaires).mockResolvedValue([OPEN_FORM]);
    const campUser = campMember();
    signedInAs(campUser);

    const { bell, tile } = await renderBoth(campUser);

    expect(tile).toBe(bell);
    expect(bell).toBe(6);
  });

  it("show the same count for a member waiting for approval who has an open form", async () => {
    vi.mocked(countUnread).mockResolvedValue(2);
    vi.mocked(countUnreadByTeam).mockResolvedValue({});
    vi.mocked(getPendingQuestionnaires).mockResolvedValue([OPEN_FORM]);
    const campUser = campMember({ approvalStatus: "pending" });
    signedInAs(campUser, true);

    const { bell, tile } = await renderBoth(campUser);

    expect(tile).toBe(bell);
    expect(bell).toBe(3);
  });

  it("count a waiting form once, not again for its own unread notice", async () => {
    // The member's one unread delivery is the notice that announced OPEN_FORM:
    // a count that leaves out the waiting forms' notices sees none.
    vi.mocked(countUnread).mockImplementation(async (_userId, options) =>
      options?.exceptActivationIds?.includes(OPEN_FORM.activationId) ? 0 : 1,
    );
    vi.mocked(countUnreadByTeam).mockResolvedValue({});
    vi.mocked(getPendingQuestionnaires).mockResolvedValue([OPEN_FORM]);
    const campUser = campMember();
    signedInAs(campUser);

    const { bell, tile } = await renderBoth(campUser);

    expect(tile).toBe(bell);
    expect(bell).toBe(1);
    // The tile says what the 1 is: something waiting, not a new announcement.
    expect(
      screen.getByRole("link", { name: "Notifications, 1 waiting" }),
    ).toBeTruthy();
  });

  it("count an acknowledged announcement on neither (test backend)", async () => {
    process.env.E2E_TEST_MODE = "1";
    testStore.reset();
    const captain = testStore.createUser({
      authUserId: "auth-captain",
      displayName: "Captain Jo",
      inviteCode: "seed",
      rank: "captain",
      approvalStatus: "approved",
    });
    const member = testStore.createUser({
      authUserId: "auth-member",
      displayName: "Nova Member",
      inviteCode: "seed",
      approvalStatus: "approved",
    });
    const publish = (title: string, presentation: "acknowledge" | "feed") => {
      const { id } = testStore.createBroadcastDraft({
        senderId: captain.id,
        title,
        body: `${title} body`,
        presentation,
      });
      expect(testStore.publishBroadcast({ id, senderId: captain.id }).ok).toBe(
        true,
      );
    };
    publish("Read the safety brief", "acknowledge");
    publish("Gates open at noon", "feed");
    const [ack] = testStore.getPendingAcknowledgements(member.id);
    expect(
      testStore.acknowledgeDelivery({
        deliveryId: ack!.deliveryId,
        userId: member.id,
      }),
    ).toBe(true);
    const campUser = campMember({ id: member.id });
    signedInAs(campUser);

    const { bell, tile } = await renderBoth(campUser);

    // Only the feed announcement is still unread; the acknowledged one is not
    // counted by either. The test store models no questionnaire sends, so
    // nothing is waiting.
    expect(tile).toBe(bell);
    expect(bell).toBe(1);
  });
});
