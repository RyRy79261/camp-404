import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NotificationBell } from "../notification-bell";

// The bell's whole job is the count: the badge is aria-hidden, so the number
// has to reach a screen reader through the accessible name or it is invisible
// to one. It is also a Popover trigger now, so it must stay a real button that
// forwards its ref and its click handler.

describe("NotificationBell", () => {
  it("says how many are unread in its accessible name", () => {
    render(<NotificationBell count={3} />);
    expect(
      screen.getByRole("button", { name: "Notifications, 3 unread" }),
    ).toBeTruthy();
  });

  it("hides the badge and says so when nothing is waiting", () => {
    const { container } = render(<NotificationBell count={0} />);
    expect(
      screen.getByRole("button", { name: "Notifications, none unread" }),
    ).toBeTruthy();
    expect(container.querySelector("[aria-hidden='true'] + span")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("caps the badge but keeps the real number in the name", () => {
    render(<NotificationBell count={128} />);
    const button = screen.getByRole("button", {
      name: "Notifications, 128 unread",
    });
    expect(button.textContent).toBe("99+");
  });

  it("never shows a negative count", () => {
    render(<NotificationBell count={-4} />);
    expect(
      screen.getByRole("button", { name: "Notifications, none unread" }),
    ).toBeTruthy();
  });

  it("opens what its parent gives it", () => {
    const onClick = vi.fn();
    render(<NotificationBell count={1} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards its ref, so a Popover trigger can anchor to it", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<NotificationBell ref={ref} />);
    expect(ref.current?.tagName).toBe("BUTTON");
    expect(ref.current?.getAttribute("type")).toBe("button");
  });
});
