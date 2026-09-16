import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildTree } from "@camp404/core";
import { testStore } from "../test-store";

// /family-tree reads this under E2E_TEST_MODE. It must give the same rows as
// @camp404/db/relations: each user with whoever made the code they redeemed,
// by name, so the real tree builder draws the same branches.

beforeEach(() => testStore.reset());

describe("testStore.getReferralRoster", () => {
  it("links each member to the maker of their invite code, by name", () => {
    const founder = testStore.createUser({
      authUserId: "auth-founder",
      displayName: "Zed",
      inviteCode: null,
      rank: "captain",
    });
    testStore.seedInviteCode({
      code: "zed-made-this",
      createdByUserId: founder.id,
    });
    const invited = testStore.createUser({
      authUserId: "auth-invited",
      displayName: "Ada",
      inviteCode: "zed-made-this",
      rank: "member",
    });
    const envCode = testStore.createUser({
      authUserId: "auth-env",
      displayName: "Bo",
      inviteCode: "test-invite-e2e-only-code",
      rank: "member",
    });

    const roster = testStore.getReferralRoster();
    expect(roster.map((r) => [r.displayName, r.inviterId])).toEqual([
      ["Ada", founder.id],
      ["Bo", null],
      ["Zed", null],
    ]);
    const roots = buildTree(roster);
    expect(roots.map((n) => n.user.id).sort()).toEqual(
      [envCode.id, founder.id].sort(),
    );
    expect(
      roots.find((n) => n.user.id === founder.id)?.children[0]?.user.id,
    ).toBe(invited.id);
  });
});
