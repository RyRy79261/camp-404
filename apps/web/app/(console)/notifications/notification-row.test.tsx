import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationRow } from "./notification-row";
import type { InboxItem } from "@/lib/notifications";

const base = {
  presentation: "feed" as InboxItem["presentation"],
  title: "Schedule posted",
  body: "The camp build schedule is now available.",
  senderName: "Captain Mreen" as string | null,
  isNew: false,
  acknowledgedAt: null as Date | null,
  createdAt: new Date(),
};

function renderRow(
  props: Partial<typeof base> & {
    href?: string;
    sentTo?: InboxItem["sentTo"];
  } = {},
) {
  return render(
    <ul>
      <NotificationRow {...base} {...props} />
    </ul>,
  );
}

describe("NotificationRow", () => {
  it("shows a New pill when unread", () => {
    renderRow({ isNew: true });
    expect(screen.queryByText("New")).toBeTruthy();
  });

  it("omits the New pill when read", () => {
    renderRow({ isNew: false });
    expect(screen.queryByText("New")).toBeNull();
  });

  it("shows 'awaiting acknowledgement' for an unacked acknowledge delivery", () => {
    renderRow({ presentation: "acknowledge", acknowledgedAt: null });
    expect(screen.queryByText(/awaiting acknowledgement/)).toBeTruthy();
  });

  it("'acknowledged' wins once acknowledgedAt is set", () => {
    renderRow({ presentation: "acknowledge", acknowledgedAt: new Date() });
    expect(screen.queryByText(/· acknowledged/)).toBeTruthy();
    expect(screen.queryByText(/awaiting/)).toBeNull();
  });

  it("suppresses attribution when there is no sender", () => {
    renderRow({ senderName: null });
    expect(screen.queryByText(/From/)).toBeNull();
  });

  it("links to the page a notification is about", () => {
    renderRow({ href: "/questionnaires/3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44" });
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "/questionnaires/3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44",
    );
    expect(link.textContent).toContain("Schedule posted");
  });

  it("is not a link when it has nowhere to go", () => {
    renderRow();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a markdown body as plain words — the row is a glimpse, not the message", () => {
    const { container } = renderRow({
      body: "## Burn night\n\n**Everyone** meets at *20:00*.",
      href: "/announcements/3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44",
    });
    expect(
      screen.getByText("Burn night Everyone meets at 20:00.", {
        collapseWhitespace: true,
      }),
    ).toBeTruthy();
    // No rendering, and no markers left behind either.
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("##");
  });

  it("clips the body only when the row opens the whole message", () => {
    const { unmount } = renderRow({
      href: "/announcements/3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44",
    });
    expect(screen.getByText(base.body).className).toContain("line-clamp-3");
    unmount();
    renderRow();
    expect(screen.getByText(base.body).className).not.toContain("line-clamp");
  });

  // #313 (mock-up aud-inbox): who else an announcement went to.
  it("says an announcement went to the drivers", () => {
    const { container } = renderRow({ sentTo: { scope: "drivers" } });
    expect(container.textContent).toContain(
      "From Captain Mreen · to the drivers",
    );
  });

  it("says 'you only' to one chosen person and counts the others", () => {
    const { container, unmount } = renderRow({
      sentTo: { scope: "individual", others: 0 },
    });
    expect(container.textContent).toContain("to you only");
    unmount();
    const again = renderRow({ sentTo: { scope: "individual", others: 2 } });
    expect(again.container.textContent).toContain("to you and 2 others");
  });

  it("says nothing about the audience of an ordinary announcement", () => {
    const { container } = renderRow({ sentTo: null });
    expect(container.textContent).not.toContain(" to ");
  });
});
