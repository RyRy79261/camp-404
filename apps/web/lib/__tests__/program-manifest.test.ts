import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MemberGate from "@/lib/member-gate";

// getProgramManifest gathers one member's facts for the request and builds
// their manifest. These run it end to end on the E2E test store (no database),
// with only the member state pinned, so they cover the wiring the pure
// manifest tests (programs.test.ts) cannot: which desktop each gate gives, and
// that the lead flag, led teams and lift really reach it.

vi.mock("@/lib/member-gate", async (importActual) => ({
  ...(await importActual<typeof MemberGate>()),
  resolveMemberState: vi.fn(),
}));

import { Team } from "@camp404/types";
import { resolveMemberState, type MemberState } from "@/lib/member-gate";
import { testStore } from "@/lib/test-store";
import type { CampUser } from "@/lib/users";
import { getProgramManifest, manifestModeFor } from "../program-manifest";
import { manifestProgramIds } from "../programs";

const AUTH = {
  id: "auth-cook",
  primaryEmail: "cook@example.com",
  displayName: "Cook",
  emailVerified: true,
};

function asMember(
  campUser: CampUser,
  block: Extract<MemberState, { kind: "member" }>["block"] = null,
) {
  const state: MemberState = {
    kind: "member",
    authUser: AUTH,
    campUser,
    block,
  };
  vi.mocked(resolveMemberState).mockResolvedValue(state);
  return state;
}

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

beforeEach(() => {
  process.env.E2E_TEST_MODE = "1";
  testStore.reset();
});
afterEach(() => {
  delete process.env.E2E_TEST_MODE;
  vi.clearAllMocks();
});

describe("manifestModeFor", () => {
  const member = {
    id: "u",
    authUserId: "a",
    displayName: null,
    profileImageUrl: null,
    inviteCode: "x",
    rank: "member",
    approvalStatus: "approved",
    approvalDecisionReason: null,
  } satisfies CampUser;
  const state = (
    campUser: CampUser,
    block: Extract<MemberState, { kind: "member" }>["block"],
  ): MemberState => ({ kind: "member", authUser: AUTH, campUser, block });

  it("gives each rung of the ladder its desktop, or none", () => {
    expect(manifestModeFor({ kind: "signed_out" })).toBeNull();
    expect(manifestModeFor(state(member, null))).toBe("full");
    expect(
      manifestModeFor(
        state(member, { reason: "questionnaire", href: "/questionnaires/q" }),
      ),
    ).toBe("held");
    expect(
      manifestModeFor(
        state(
          { ...member, approvalStatus: "pending" },
          { reason: "approval", href: "/pending-approval" },
        ),
      ),
    ).toBe("restricted");
    // A rejected applicant is blocked the same way, but gets no desktop.
    expect(
      manifestModeFor(
        state(
          { ...member, approvalStatus: "rejected" },
          { reason: "approval", href: "/pending-approval" },
        ),
      ),
    ).toBeNull();
    expect(
      manifestModeFor(
        state(member, { reason: "invite", href: "/signup/required" }),
      ),
    ).toBeNull();
    expect(
      manifestModeFor(
        state(member, {
          reason: "onboarding",
          href: "/onboarding/questionnaire",
        }),
      ),
    ).toBeNull();
  });
});

describe("getProgramManifest", () => {
  it("builds a Kitchen lead's desktop from their real memberships and lift", async () => {
    const cook = testStore.createUser({
      authUserId: AUTH.id,
      displayName: "Cook",
      inviteCode: "seed",
    });
    testStore.seedTeamMembership({
      userId: cook.id,
      team: Team.enum.kitchen,
      isLead: true,
    });
    testStore.seedDriverProfile({ userId: cook.id, vehicleMake: "VW" });
    asMember(campUserOf(cook));

    const manifest = await getProgramManifest();

    expect(manifest?.mode).toBe("full");
    const ids = manifestProgramIds(manifest!);
    expect(ids.has("recipe-review")).toBe(true);
    expect(ids.has("questionnaires")).toBe(true);
    expect(ids.has("my-lift")).toBe(true);
    expect(ids.has("overview")).toBe(false);
    expect(manifest!.teamFolders).toMatchObject([
      { team: Team.enum.kitchen, label: "Kitchen team", lead: true },
    ]);
    // A member's health flag is coarse; E2E test mode itself is a warning.
    expect(manifest!.tray.health).toEqual({ status: "warning" });
  });

  it("gives a plain member no lead programs and no My lift", async () => {
    const plain = testStore.createUser({
      authUserId: AUTH.id,
      displayName: "Plain",
      inviteCode: "seed",
    });
    asMember(campUserOf(plain));

    const ids = manifestProgramIds((await getProgramManifest())!);
    expect(ids.has("questionnaires")).toBe(false);
    expect(ids.has("my-lift")).toBe(false);
    expect(ids.has("tasks")).toBe(true);
  });

  it("gives a captain the health details", async () => {
    const captain = testStore.createUser({
      authUserId: AUTH.id,
      displayName: "Cap",
      inviteCode: "seed",
      rank: "captain",
    });
    asMember(campUserOf(captain));

    const manifest = await getProgramManifest();
    expect(manifest!.tray.health).toMatchObject({
      status: "warning",
      href: "/captains/system",
    });
  });

  it("gives an applicant the restricted desktop and a rejected one nothing", async () => {
    const pending = testStore.createUser({
      authUserId: AUTH.id,
      displayName: "New",
      inviteCode: "seed",
      approvalStatus: "pending",
    });
    asMember(campUserOf(pending), {
      reason: "approval",
      href: "/pending-approval",
    });
    const manifest = await getProgramManifest();
    expect(manifest?.mode).toBe("restricted");
    expect([...manifestProgramIds(manifest!)]).toEqual(["inbox"]);

    asMember(
      { ...campUserOf(pending), approvalStatus: "rejected" },
      { reason: "approval", href: "/pending-approval" },
    );
    expect(await getProgramManifest()).toBeNull();
  });

  it("gives nobody signed out a manifest", async () => {
    vi.mocked(resolveMemberState).mockResolvedValue({ kind: "signed_out" });
    expect(await getProgramManifest()).toBeNull();
  });
});
