import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { windowStorageKey } from "@/components/os/window-storage";
import { SignOutLink } from "@/components/auth/sign-out-link";

const loadDeviceToken = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({} as never)),
);
vi.mock("@/components/push/load-device-token", () => ({ loadDeviceToken }));

// The push token is forgotten on /auth/sign-out itself (SignOutView), which
// every sign-out reaches; the link only clears this tab's desktop and goes.

afterEach(() => {
  loadDeviceToken.mockClear();
  cleanup();
  window.sessionStorage.clear();
});

describe("SignOutLink", () => {
  it("starts downloading the push-token cleanup when pointed at, focused or clicked", () => {
    render(<SignOutLink />);
    const link = screen.getByRole("link", { name: "Sign out" });
    expect(loadDeviceToken).not.toHaveBeenCalled();
    fireEvent.pointerEnter(link);
    expect(loadDeviceToken).toHaveBeenCalledTimes(1);
    fireEvent.focus(link);
    expect(loadDeviceToken).toHaveBeenCalledTimes(2);
    fireEvent.click(link);
    expect(loadDeviceToken).toHaveBeenCalledTimes(3);
  });

  it("is a plain sign-out link", () => {
    render(<SignOutLink className="x" />);
    const link = screen.getByRole("link", { name: "Sign out" });
    expect(link.getAttribute("href")).toBe("/auth/sign-out");
    expect(link.className).toBe("x");
  });

  it("forgets the tab's windows and follows its href", () => {
    window.sessionStorage.setItem(windowStorageKey("u-1"), "[]");
    render(<SignOutLink />);
    const link = screen.getByRole("link", { name: "Sign out" });
    const click = createEvent.click(link);
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(false);
    expect(window.sessionStorage.getItem(windowStorageKey("u-1"))).toBeNull();
  });

  it("leaves a modified click (new tab) to the browser", () => {
    window.sessionStorage.setItem(windowStorageKey("u-1"), "[]");
    render(<SignOutLink />);
    fireEvent.click(screen.getByRole("link", { name: "Sign out" }), {
      metaKey: true,
    });
    expect(window.sessionStorage.getItem(windowStorageKey("u-1"))).toBe("[]");
  });
});
