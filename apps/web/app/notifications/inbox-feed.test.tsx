import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("./actions", () => ({ loadOlderNotificationsAction: vi.fn() }));

import type { InboxItem } from "@/lib/notifications";
import { loadOlderNotificationsAction } from "./actions";
import { InboxFeed } from "./inbox-feed";

const NOW = new Date("2026-09-16T10:00:00Z");

function item(
  id: string,
  iso: string,
  extra: Partial<InboxItem> = {},
): InboxItem {
  return {
    id,
    title: `Notice ${id}`,
    body: `Body ${id}`,
    presentation: "feed",
    senderName: null,
    readAt: null,
    acknowledgedAt: null,
    createdAt: new Date(iso),
    kind: "announcement",
    link: "/notifications",
    ...extra,
  };
}

afterEach(() => {
  cleanup();
  vi.mocked(loadOlderNotificationsAction).mockReset();
});

describe("InboxFeed", () => {
  it("puts notifications under camp-day headings", () => {
    render(
      <InboxFeed
        initialItems={[
          item("a", "2026-09-16T09:00:00Z"),
          item("b", "2026-09-15T21:30:00Z"),
        ]}
        initialCursor={null}
        now={NOW}
      />,
    );
    const today = screen.getByRole("region", { name: "Today" });
    expect(within(today).getByText("Notice a")).toBeDefined();
    const yesterday = screen.getByRole("region", { name: "Yesterday" });
    expect(within(yesterday).getByText("Notice b")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Load older" })).toBeNull();
  });

  it("appends the older page and stops when there is no more", async () => {
    vi.mocked(loadOlderNotificationsAction).mockResolvedValue({
      ok: true,
      data: { items: [item("c", "2026-09-10T08:00:00Z")], nextCursor: null },
    });
    render(
      <InboxFeed
        initialItems={[item("a", "2026-09-16T09:00:00Z")]}
        initialCursor="cursor-1"
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    expect(await screen.findByText("Notice c")).toBeDefined();
    expect(loadOlderNotificationsAction).toHaveBeenCalledWith("cursor-1");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load older" })).toBeNull(),
    );
  });

  it("says a failed load failed and offers to try again", async () => {
    vi.mocked(loadOlderNotificationsAction)
      .mockResolvedValueOnce({
        ok: false,
        error: "Couldn't load older notifications.",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [item("c", "2026-09-10T08:00:00Z")], nextCursor: null },
      });
    render(
      <InboxFeed
        initialItems={[item("a", "2026-09-16T09:00:00Z")]}
        initialCursor="cursor-1"
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't load older notifications.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Notice c")).toBeDefined();
  });
});
