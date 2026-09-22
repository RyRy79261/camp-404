import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The inbox page: opening it clears the unread badge, but a failed clear must
// not take the list down with it — and the tab it was opened on decides both
// which rows are read and whether they are marked.

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
  countUnread: vi.fn(async () => 0),
}));
vi.mock("./filter-tabs", () => ({
  NotificationFilterTabs: ({
    filter,
    unreadCount,
  }: {
    filter: string;
    unreadCount: number;
  }) => <div data-testid="tabs">{`${filter}/${unreadCount}`}</div>,
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

import { countUnread, listInbox, markRead } from "@/lib/notifications";
import NotificationsPage from "./page";

/** Render the page on a tab (default: the All tab, i.e. no ?filter=). */
function renderPage(filter?: string) {
  return NotificationsPage({ searchParams: Promise.resolve({ filter }) });
}

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

    render(await renderPage());

    expect(screen.getByText("Gates open at noon")).toBeTruthy();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("puts the page title first in the outline", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never);

    const { container } = render(await renderPage());

    const headings = container.querySelectorAll("h1, h2, h3");
    expect(headings[0]?.tagName).toBe("H1");
    expect(headings[0]?.textContent).toBe("Notifications");
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
  });
});

describe("notifications page filters", () => {
  beforeEach(() => {
    // Clear the rejecting markRead the failure case above installs.
    vi.mocked(markRead).mockReset();
    vi.mocked(listInbox).mockResolvedValue({
      items: [{ id: "n1", title: "Gates open at noon" }],
      nextCursor: null,
    } as never);
    vi.mocked(countUnread).mockResolvedValue(4);
  });

  it("reads the whole inbox and clears its page on the default tab", async () => {
    render(await renderPage());
    expect(listInbox).toHaveBeenCalledWith("u1", { filter: "all" });
    expect(markRead).toHaveBeenCalledWith("u1", ["n1"]);
    expect(screen.getByTestId("tabs").textContent).toBe("all/4");
  });

  it("filters in the query, so paging still works", async () => {
    render(await renderPage("announcements"));
    expect(listInbox).toHaveBeenCalledWith("u1", { filter: "announcements" });
  });

  it("does not empty the Unread tab under the member reading it", async () => {
    render(await renderPage("unread"));
    expect(listInbox).toHaveBeenCalledWith("u1", { filter: "unread" });
    expect(markRead).not.toHaveBeenCalled();
    // The rows are still on screen — not marking read is not "show nothing".
    expect(screen.getByText("Gates open at noon")).toBeTruthy();
  });

  it("opens the whole inbox for a stale ?filter= in a shared link", async () => {
    render(await renderPage("bulletins"));
    expect(listInbox).toHaveBeenCalledWith("u1", { filter: "all" });
  });

  it("says what is missing on the tab you are on", async () => {
    vi.mocked(listInbox).mockResolvedValue({
      items: [],
      nextCursor: null,
    } as never);
    render(await renderPage("unread"));
    expect(screen.getByText("You're all caught up.")).toBeTruthy();
    cleanup();
    render(await renderPage("announcements"));
    expect(screen.getByText("No announcements yet.")).toBeTruthy();
  });
});
