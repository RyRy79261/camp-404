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

function renderRow(props: Partial<typeof base> = {}) {
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
});
