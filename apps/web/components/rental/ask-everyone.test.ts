import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(console)/captains/gear-rental/actions", () => ({
  askForGearOrdersAction: vi.fn(),
}));

import { askedText } from "./ask-everyone";

// What a captain is told after "Ask everyone" (#241): how many members were
// asked, and how many got no second notice because their first is unread.

describe("askedText", () => {
  it("says when there is nobody to ask", () => {
    expect(askedText(0, 0)).toBe(
      "Nobody to ask: everyone who is coming has sent their order.",
    );
  });

  it("counts the members asked", () => {
    expect(askedText(1, 1)).toBe("Asked 1 member.");
    expect(askedText(12, 12)).toBe("Asked 12 members.");
  });

  it("says who got no second notice", () => {
    expect(askedText(3, 1)).toBe(
      "Asked 3 members. 2 already had the ask unread and got no second notice.",
    );
    expect(askedText(3, 0)).toBe(
      "3 members already have the ask unread. No second notice was sent.",
    );
    expect(askedText(1, 0)).toBe(
      "1 member already has the ask unread. No second notice was sent.",
    );
  });
});
