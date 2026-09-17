import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The inbox page: opening it clears the unread badge, but a failed clear must
// not take the list down with it.

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserOrRedirect: vi.fn(async () => ({
    primaryEmail: "member@example.com",
  })),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(async () => ({ id: "u1" })),
  hasCampAccess: () => true,
  isApproved: () => true,
  syncOpenGates: vi.fn(),
  getPendingQuestionnaires: vi.fn(async () => []),
}));
vi.mock("@/lib/promotion", () => ({
  getIncomingPromotionsForUser: vi.fn(async () => []),
}));
vi.mock("@/lib/notifications", () => ({
  listInbox: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("./inbox-feed", () => ({
  InboxFeed: ({ initialItems }: { initialItems: { title: string }[] }) => (
    <ul>
      {initialItems.map((i) => (
        <li key={i.title}>{i.title}</li>
      ))}
    </ul>
  ),
}));

import { listInbox, markRead } from "@/lib/notifications";
import NotificationsPage from "./page";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifications page", () => {
  it("still shows the inbox when clearing the badge fails", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [{ id: "n1", title: "Gates open at noon" }],
      nextCursor: null,
    } as never);
    vi.mocked(markRead).mockRejectedValue(new Error("connection reset"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    render(await NotificationsPage());

    expect(screen.getByText("Gates open at noon")).toBeTruthy();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("puts the page title first in the outline", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never);

    const { container } = render(await NotificationsPage());

    const headings = container.querySelectorAll("h1, h2, h3");
    expect(headings[0]?.tagName).toBe("H1");
    expect(headings[0]?.textContent).toBe("Notifications");
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
  });
});
