import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The header panel. Three things matter and none of them are cosmetic:
//
//  1. It fetches NOTHING until it is opened (the header renders on every page).
//  2. It lists what the badge counts — deliveries AND waiting questionnaires —
//     or a badge reading 2 hangs over an empty panel.
//  3. Opening it marks nothing read. A peek that cleared the badge would lose
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

function panel(count: number, unreadCount = count) {
  return <NotificationPanel count={count} unreadCount={unreadCount} />;
}

function openBell() {
  fireEvent.click(screen.getByRole("button", { name: /^Notifications,/ }));
}

beforeEach(() => {
  vi.mocked(fetchNotificationPanelAction).mockReset();
  vi.mocked(markAllNotificationsReadAction).mockReset();
  vi.mocked(fetchNotificationPanelAction).mockResolvedValue({
    recent: [DELIVERY],
    pending: [QUESTIONNAIRE],
  });
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
    vi.mocked(fetchNotificationPanelAction).mockResolvedValue({
      recent: [],
      pending: [],
    });
    render(panel(0));
    openBell();
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  });

  it("clears the inbox through Mark all read and refetches", async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({
      ok: true,
      data: { cleared: 1 },
    });
    render(panel(2));
    openBell();
    await screen.findByText("Gates open at noon");

    vi.mocked(fetchNotificationPanelAction).mockResolvedValue({
      recent: [{ ...DELIVERY, readAt: new Date("2026-09-16T10:00:00Z") }],
      pending: [QUESTIONNAIRE],
    });
    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));

    await waitFor(() =>
      expect(markAllNotificationsReadAction).toHaveBeenCalledTimes(1),
    );
    // Only the questionnaire is still unread: it clears when it is answered.
    await waitFor(() =>
      expect(screen.getAllByLabelText("Unread").length).toBe(1),
    );
  });

  it("offers nothing to clear when no delivery is unread", async () => {
    // The badge reads 1 for a waiting questionnaire, which "Mark all read"
    // cannot touch — so the button must not invite a press that does nothing.
    render(panel(1, 0));
    openBell();
    await screen.findByText("Kitchen shift preferences");
    expect(
      screen.getByRole("button", { name: /Mark all read/ }),
    ).toHaveProperty("disabled", true);
  });
});
