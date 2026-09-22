import { isValidElement, type ReactNode } from "react";
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

/**
 * The key React would reconcile the feed by, dug out of the page's element
 * tree. The feed keeps its rows and cursor in `useState`, so only the key
 * decides whether a tab switch gets a fresh one — and a key is invisible to
 * anything rendered, which is why this looks at the tree instead.
 */
function feedKey(node: ReactNode): string | null | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = feedKey(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = node.props as { initialItems?: unknown; children?: ReactNode };
  if (props.initialItems !== undefined) return node.key;
  return feedKey(props.children);
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

  // The count beside the Unread tab is read AFTER the page is marked read, or
  // the All tab would advertise "Unread · 4" on a tab this very render emptied.
  it("counts the Unread tab after the page it drew is cleared, not before", async () => {
    let cleared = false;
    vi.mocked(markRead).mockImplementation(async () => {
      cleared = true;
    });
    vi.mocked(countUnread).mockImplementation(async () => (cleared ? 0 : 4));

    render(await renderPage());

    expect(markRead).toHaveBeenCalled();
    expect(screen.getByTestId("tabs").textContent).toBe("all/0");
  });

  // The Unread tab clears nothing, so its count is what the member arrived to.
  it("keeps the count the member arrived to on the tab that clears nothing", async () => {
    let cleared = false;
    vi.mocked(markRead).mockImplementation(async () => {
      cleared = true;
    });
    vi.mocked(countUnread).mockImplementation(async () => (cleared ? 0 : 4));

    render(await renderPage("unread"));

    expect(markRead).not.toHaveBeenCalled();
    expect(screen.getByTestId("tabs").textContent).toBe("unread/4");
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

  // Switching tabs is a navigation inside the same route, so React would keep
  // the feed mounted and hand it new props — and the feed seeds its rows and
  // cursor from props once, on mount. Without a key per tab, Announcements
  // would open on the rows the All tab had loaded.
  it("gives the feed a key per tab, so a tab switch starts it fresh", async () => {
    expect(feedKey(await renderPage())).toBe("all");
    expect(feedKey(await renderPage("announcements"))).toBe("announcements");
    expect(feedKey(await renderPage("unread"))).toBe("unread");
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
