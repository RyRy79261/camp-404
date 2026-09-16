import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

vi.mock("@/components/push/device-token", () => ({
  forgetDeviceToken: vi.fn(),
}));

import { forgetDeviceToken } from "@/components/push/device-token";
import {
  FORGET_TOKEN_TIMEOUT_MS,
  SignOutLink,
} from "@/components/auth/sign-out-link";

const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => {
  cleanup();
  assign.mockReset();
  vi.mocked(forgetDeviceToken).mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SignOutLink", () => {
  it("is a plain sign-out link", () => {
    render(<SignOutLink className="x" />);
    const link = screen.getByRole("link", { name: "Sign out" });
    expect(link.getAttribute("href")).toBe("/auth/sign-out");
    expect(link.className).toBe("x");
  });

  it("forgets this device's push token, then signs out", async () => {
    let finish!: () => void;
    vi.mocked(forgetDeviceToken).mockReturnValue(
      new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<SignOutLink />);
    fireEvent.click(screen.getByRole("link", { name: "Sign out" }));
    expect(forgetDeviceToken).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(assign).toHaveBeenCalledWith("/auth/sign-out");
  });

  it("signs out anyway when the cleanup is slow", async () => {
    vi.useFakeTimers();
    vi.mocked(forgetDeviceToken).mockReturnValue(new Promise<void>(() => {}));
    render(<SignOutLink href="/auth/sign-out?x=1" />);
    fireEvent.click(screen.getByRole("link", { name: "Sign out" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FORGET_TOKEN_TIMEOUT_MS);
    });
    expect(assign).toHaveBeenCalledWith("/auth/sign-out?x=1");
  });

  it("leaves a modified click (new tab) to the browser", () => {
    render(<SignOutLink />);
    fireEvent.click(screen.getByRole("link", { name: "Sign out" }), {
      metaKey: true,
    });
    expect(forgetDeviceToken).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
