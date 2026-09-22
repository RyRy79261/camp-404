import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/link needs no router for static rendering; map it to a plain anchor.
// The tabs are links, so the filtered inbox stays a server render and a link
// someone can send. A click handler here would mean the list had to re-fetch
// itself on the client — which is exactly what AfrikaBurn's inbox avoids.

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { NotificationFilterTabs } from "./filter-tabs";

afterEach(cleanup);

describe("NotificationFilterTabs", () => {
  it("offers all three tabs as links, with the default tab's URL clean", () => {
    render(<NotificationFilterTabs filter="all" unreadCount={0} />);
    expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe(
      "/notifications",
    );
    expect(
      screen.getByRole("link", { name: "Unread" }).getAttribute("href"),
    ).toBe("/notifications?filter=unread");
    expect(
      screen
        .getByRole("link", { name: "Announcements only" })
        .getAttribute("href"),
    ).toBe("/notifications?filter=announcements");
  });

  // The console nav carries a link called "Announcements" (the captain
  // composer) for a team lead and above, and on this page both are on screen.
  // The filter keeps AfrikaBurn's visible label and takes its own accessible
  // name from an sr-only word, so the two are not read out identically.
  it("does not share its accessible name with the nav's Announcements link", () => {
    render(<NotificationFilterTabs filter="all" unreadCount={0} />);
    const tab = screen.getByRole("link", { name: "Announcements only" });
    // Visibly it still says just "Announcements" — the rest is sr-only. And it
    // is a WORD apart: an appended " only" would be announced as one run-on
    // word, because accessible-name computation trims each node it joins.
    expect(tab.querySelector("[aria-hidden]")?.textContent).toBe(
      "Announcements",
    );
    expect(screen.queryByRole("link", { name: "Announcements" })).toBeNull();
  });

  it("says how much is unread, and only when something is", () => {
    render(<NotificationFilterTabs filter="all" unreadCount={4} />);
    expect(screen.getByRole("link", { name: "Unread · 4" })).toBeTruthy();
    cleanup();
    render(<NotificationFilterTabs filter="all" unreadCount={0} />);
    expect(screen.queryByRole("link", { name: /Unread ·/ })).toBeNull();
  });

  it("marks the tab being read as the current page", () => {
    render(<NotificationFilterTabs filter="announcements" unreadCount={0} />);
    expect(
      screen
        .getByRole("link", { name: "Announcements only" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "All" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
