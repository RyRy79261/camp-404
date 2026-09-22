import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { testStore } from "../test-store";

// The E2E backend routes the inbox tabs and "Mark all read" to this store, so
// Playwright only drives them if the mirror has them too — and a store that
// DISAGREED with @camp404/db would be worse than none: it makes e2e green over
// a broken app. These are the same two rules the PGlite tests assert against the
// real queries (packages/db/src/__tests__/inbox-filter.test.ts): the tab narrows
// the set the cursor walks, and mark-all touches only the caller's rows.

function seed() {
  const captain = testStore.createUser({
    authUserId: "auth-captain",
    displayName: "Captain Jo",
    inviteCode: "seed",
    rank: "captain",
    approvalStatus: "approved",
  });
  const member = testStore.createUser({
    authUserId: "auth-member",
    displayName: "Member",
    inviteCode: "seed",
    approvalStatus: "pending",
  });
  const other = testStore.createUser({
    authUserId: "auth-other",
    displayName: "Other",
    inviteCode: "seed",
    approvalStatus: "pending",
  });
  return { captain, member, other };
}

/** Publish an announcement to the whole camp (the author is excluded). */
function announce(senderId: string, title: string) {
  const { id } = testStore.createBroadcastDraft({
    senderId,
    title,
    body: `${title} body`,
    presentation: "feed",
  });
  const result = testStore.publishBroadcast({ id, senderId });
  expect(result.ok).toBe(true);
}

describe("testStore inbox filters — the db's WHERE, mirrored", () => {
  beforeEach(() => testStore.reset());

  it("narrows the list to unread, and to announcements", () => {
    const { captain, member } = seed();
    // An approval decision: a personal event, NOT an announcement kind.
    testStore.setUserApproval({
      userId: member.id,
      from: "pending",
      to: "approved",
      decidedByUserId: captain.id,
    });
    announce(captain.id, "Gates open at noon");

    const all = testStore.listInbox(member.id).items;
    expect(all.map((i) => i.kind).sort()).toEqual([
      "announcement",
      "approval_decision",
    ]);

    expect(
      testStore
        .listInbox(member.id, { filter: "announcements" })
        .items.map((i) => i.title),
    ).toEqual(["Gates open at noon"]);

    // Read the announcement; the Unread tab drops exactly that row.
    const announcement = all.find((i) => i.kind === "announcement")!;
    testStore.markRead(member.id, [announcement.id]);
    expect(
      testStore
        .listInbox(member.id, { filter: "unread" })
        .items.map((i) => i.kind),
    ).toEqual(["approval_decision"]);
  });

  it("pages inside the filter, so a page of hidden rows never shortens a page", () => {
    const { captain, member } = seed();
    // Bury each announcement under a captain request, which is a personal
    // event of a different kind. The request is declined straight away so the
    // next send is not the store's idempotent open-per-target hit.
    for (const n of [1, 2, 3]) {
      const request = testStore.sendCaptainPromotion({
        targetUserId: member.id,
        requestedByUserId: captain.id,
      });
      testStore.decideCaptainPromotion({
        requestId: request.id,
        status: "declined",
        actorUserId: member.id,
      });
      announce(captain.id, `Bulletin ${n}`);
    }
    expect(testStore.listInbox(member.id).items).toHaveLength(6);
    const first = testStore.listInbox(member.id, {
      filter: "announcements",
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.items.every((i) => i.kind === "announcement")).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = testStore.listInbox(member.id, {
      filter: "announcements",
      limit: 2,
      before: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});

describe("testStore.markAllRead — the db's UPDATE, mirrored", () => {
  beforeEach(() => testStore.reset());

  it("clears only the caller's unread rows, and says how many", () => {
    const { captain, member, other } = seed();
    announce(captain.id, "Gates open at noon");
    announce(captain.id, "Shade build at 06:00");

    expect(testStore.countUnread(member.id)).toBe(2);
    expect(testStore.countUnread(other.id)).toBe(2);

    expect(testStore.markAllRead(member.id)).toBe(2);

    expect(testStore.countUnread(member.id)).toBe(0);
    // The other member's inbox is untouched.
    expect(testStore.countUnread(other.id)).toBe(2);
    // A second press has nothing left to clear and says so.
    expect(testStore.markAllRead(member.id)).toBe(0);
  });

  it("leaves a pop-up the member has not been shown, exactly as the db does", () => {
    const { captain, member } = seed();
    announce(captain.id, "Gates open at noon");
    // A "make captain" request is delivered as a pop-up; `readAt` on it is the
    // "was shown" mark claimPopups stamps, so mark-all must not consume it.
    testStore.sendCaptainPromotion({
      targetUserId: member.id,
      requestedByUserId: captain.id,
    });

    expect(testStore.countUnread(member.id)).toBe(2);
    expect(testStore.unreadClearableCount(member.id)).toBe(1);
    expect(testStore.markAllRead(member.id)).toBe(1);

    // The pop-up is still owed and still claimable.
    expect(testStore.countUnseenPopups(member.id)).toBe(1);
    expect(testStore.claimPopups(member.id)).toHaveLength(1);
    expect(testStore.countUnseenPopups(member.id)).toBe(0);
    expect(testStore.countUnread(member.id)).toBe(0);
  });
});
