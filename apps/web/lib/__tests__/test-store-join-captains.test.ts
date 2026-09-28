import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { testStore } from "../test-store";

// About Camp 404 reads this under E2E_TEST_MODE. It must pick the same
// captains as @camp404/db/join-site's getJoinCaptains: captains only, who
// switched on "Show me on join.camp-404.com", who have a name; by name, with
// "Captain" when they gave no title.

beforeEach(() => testStore.reset());

function user(
  authUserId: string,
  displayName: string | null,
  captain: boolean,
) {
  return testStore.createUser({
    authUserId,
    displayName,
    inviteCode: null,
    rank: captain ? "captain" : "member",
  });
}

describe("testStore.listJoinCaptains", () => {
  it("lists opted-in, named captains by name, and nobody else", () => {
    const zed = user("auth-zed", "Zed", true);
    const ada = user("auth-ada", "Ada", true);
    const hidden = user("auth-hidden", "Hidden", true);
    const member = user("auth-member", "Member", false);
    const nameless = user("auth-nameless", null, true);
    testStore.setCampBlurb(zed.id, {
      title: "The Original Error Code",
      blurb: "Unicycles.",
      showOnJoin: true,
    });
    testStore.setCampBlurb(ada.id, {
      title: null,
      blurb: null,
      showOnJoin: true,
    });
    testStore.setCampBlurb(hidden.id, {
      title: "Hidden",
      blurb: null,
      showOnJoin: false,
    });
    for (const u of [member, nameless]) {
      testStore.setCampBlurb(u.id, {
        title: null,
        blurb: null,
        showOnJoin: true,
      });
    }

    expect(testStore.listJoinCaptains()).toEqual([
      { name: "Ada", title: "Captain", blurb: "" },
      { name: "Zed", title: "The Original Error Code", blurb: "Unicycles." },
    ]);
  });
});
