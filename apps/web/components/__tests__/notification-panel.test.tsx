import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The header panel. What matters here is not cosmetic:
//
//  1. It fetches NOTHING until it is opened (the header renders on every page).
//  2. It lists what the badge counts — deliveries AND waiting questionnaires —
//     or a badge reading 2 hangs over an empty panel.
//  3. It says the unread TOTAL, because it lists only the newest few rows: a
//     badge of 10 over six already-read rows must still add up.
//  4. "Mark all read" is armed by that fresh total, never by the header's
//     server render and never latched off by its own press.
//  5. A read that FAILS says so. Painting the empty state over a failed read
//     tells the member nothing was sent, which is the opposite of the truth.
//  6. Opening it marks nothing read. A peek that cleared the badge would lose
//     the member their unread list.

// next/link needs no router for static rendering; map it to a plain anchor.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(console)/notifications/actions", () => ({
  fetchNotificationPanelAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

import {
  fetchNotificationPanelAction,
  markAllNotificationsReadAction,
  type NotificationPanelData,
} from "@/app/(console)/notifications/actions";
import { NotificationPanel } from "@/components/notifications/notification-panel";

const DELIVERY = {
  id: "d1",
  title: "Gates open at noon",
  body: "Meet at the shade structure.",
  presentation: "feed" as const,
  senderName: "Captain Jo",
  readAt: null,
  acknowledgedAt: null,
  createdAt: new Date("2026-09-16T09:00:00Z"),
  kind: "announcement" as const,
  link: "/announcements/a1",
};

const QUESTIONNAIRE = {
  activationId: "q1",
  title: "Kitchen shift preferences",
  blocking: true,
  dueAt: null,
};

/** What the action hands back, with only the bit a test cares about spelled. */
function loaded(overrides: Partial<NotificationPanelData> = {}) {
  return {
    ok: true as const,
    data: {
      recent: [DELIVERY],
      pending: [QUESTIONNAIRE],
      clearable: 1,
      ...overrides,
    },
  };
}

function panel(count: number) {
  return <NotificationPanel count={count} />;
}

function openBell() {
  fireEvent.click(screen.getByRole("button", { name: /^Notifications,/ }));
}

const markAllButton = () =>
  screen.getByRole("button", { name: /Mark all read/ });

beforeEach(() => {
  vi.mocked(fetchNotificationPanelAction).mockReset();
  vi.mocked(markAllNotificationsReadAction).mockReset();
  vi.mocked(fetchNotificationPanelAction).mockResolvedValue(loaded());
});

afterEach(cleanup);

describe("NotificationPanel", () => {
  it("fetches nothing until the bell is opened", () => {
    render(panel(2));
    expect(fetchNotificationPanelAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Gates open at noon")).toBeNull();
  });

  it("lists both halves of what the badge counts", async () => {
    render(panel(2));
    openBell();

    expect(await screen.findByText("Gates open at noon")).toBeTruthy();
    // The questionnaire the badge also counts — without it the panel would show
    // one row under a badge reading 2.
    expect(screen.getByText("Kitchen shift preferences")).toBeTruthy();
    const href = (name: RegExp) =>
      screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/Kitchen shift preferences/)).toBe("/questionnaires/q1");
    expect(href(/Gates open at noon/)).toBe("/announcements/a1");
    expect(href(/See all/)).toBe("/notifications");
  });

  it("marks nothing read just by being opened", async () => {
    render(panel(2));
    openBell();
    await screen.findByText("Gates open at noon");
    expect(markAllNotificationsReadAction).not.toHaveBeenCalled();
    // The rows still carry their unread mark, because nothing cleared them.
    expect(screen.getAllByLabelText("Unread").length).toBe(2);
  });

  it("says so when there is nothing waiting", async () => {
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({ recent: [], pending: [], clearable: 0 }),
    );
    render(panel(0));
    openBell();
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  });

  // The list is a window on the inbox — six rows at most — so the unread TOTAL
  // has to be written out, or a badge of 10 hangs over rows that are all read.
  it("says the unread total, not the number of rows it happens to show", async () => {
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({
        recent: [{ ...DELIVERY, readAt: new Date("2026-09-16T10:00:00Z") }],
        pending: [],
        clearable: 10,
      }),
    );
    render(panel(10));
    openBell();

    // One row on screen, and none of it unread — the number still adds up.
    expect(await screen.findByText("10 unread")).toBeTruthy();
    expect(screen.queryAllByLabelText("Unread")).toHaveLength(0);
  });

  it("says nothing is unread rather than leaving the badge unexplained", async () => {
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({ recent: [], clearable: 0 }),
    );
    render(panel(1));
    openBell();
    expect(await screen.findByText("Nothing unread")).toBeTruthy();
  });

  it("clears the inbox through Mark all read and refetches", async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({
      ok: true,
      data: { cleared: 1 },
    });
    render(panel(2));
    openBell();
    await screen.findByText("Gates open at noon");

    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({
        recent: [{ ...DELIVERY, readAt: new Date("2026-09-16T10:00:00Z") }],
        clearable: 0,
      }),
    );
    fireEvent.click(markAllButton());

    await waitFor(() =>
      expect(markAllNotificationsReadAction).toHaveBeenCalledTimes(1),
    );
    // Only the questionnaire is still unread: it clears when it is answered.
    await waitFor(() =>
      expect(screen.getAllByLabelText("Unread").length).toBe(1),
    );
  });

  // The button used to latch itself off after a successful press. A delivery
  // that lands between the press and the refetch would then find a dead
  // control, and the member could not clear it without reloading the page.
  it("re-arms itself when the refetch finds something new unread", async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({
      ok: true,
      data: { cleared: 1 },
    });
    render(panel(2));
    openBell();
    await screen.findByText("Gates open at noon");

    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({ clearable: 1 }),
    );
    fireEvent.click(markAllButton());

    await waitFor(() =>
      expect(fetchNotificationPanelAction).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(markAllButton()).toHaveProperty("disabled", false),
    );
  });

  // The header's badge counts waiting questionnaires too, and "Mark all read"
  // cannot touch those — so the control is armed by the panel's own count.
  it("offers nothing to clear when no delivery is unread", async () => {
    // The badge reads 1 for a waiting questionnaire, which "Mark all read"
    // cannot touch — so the button must not invite a press that does nothing.
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({ recent: [], clearable: 0 }),
    );
    render(panel(1));
    openBell();
    await screen.findByText("Kitchen shift preferences");
    expect(markAllButton()).toHaveProperty("disabled", true);
  });

  it("arms the button from the fresh count, not from the header's render", async () => {
    // The header rendered when nothing was unread; a delivery has landed since.
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(
      loaded({ clearable: 3 }),
    );
    render(panel(0));
    openBell();
    await screen.findByText("3 unread");
    expect(markAllButton()).toHaveProperty("disabled", false);
  });

  it("reports a failed read instead of painting the empty state over it", async () => {
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    render(panel(2));
    openBell();

    expect(
      await screen.findByText(/Couldn’t load your notifications/),
    ).toBeTruthy();
    // Emphatically NOT "nothing was sent to you".
    expect(screen.queryByText(/Nothing here yet/)).toBeNull();
    // And nothing is offered that cannot work on rows that never arrived.
    expect(markAllButton()).toHaveProperty("disabled", true);

    vi.mocked(fetchNotificationPanelAction).mockResolvedValue(loaded());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Gates open at noon")).toBeTruthy();
  });

  it("drops the last open's rows, so a reopen never shows stale read state", async () => {
    render(panel(2));
    openBell();
    await screen.findByText("Gates open at noon");

    fireEvent.click(screen.getByRole("button", { name: /^Notifications,/ }));
    await waitFor(() =>
      expect(screen.queryByText("Gates open at noon")).toBeNull(),
    );

    // Reopen against a fetch that has not answered yet: the panel must say it
    // is loading, not redraw the rows (and unread dots) it kept from last time.
    vi.mocked(fetchNotificationPanelAction).mockReturnValue(
      new Promise(() => {}) as never,
    );
    openBell();
    expect(await screen.findByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("Gates open at noon")).toBeNull();
  });
});
