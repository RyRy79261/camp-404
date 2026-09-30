import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  draftStorageKey,
  windowStorageKey,
} from "@/components/os/window-storage";
import { SignOutView } from "../sign-out-view";

// Erasure reaches /auth/sign-out by a server redirect, and a typed address
// never passes through SignOutLink either: the page itself must forget the
// tab's desktop and drafts, and this device's push token.

const signOut = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut } }));

const forgetDeviceToken = vi.hoisted(() => vi.fn());
vi.mock("@/components/push/device-token", () => ({
  FORGET_TOKEN_TIMEOUT_MS: 2000,
  forgetDeviceToken,
}));

beforeEach(() => {
  forgetDeviceToken.mockReset().mockResolvedValue(undefined);
  signOut.mockClear();
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("SignOutView", () => {
  it("forgets the tab's windows and editor drafts before signing out", async () => {
    window.sessionStorage.setItem(windowStorageKey("u-1"), "[]");
    window.sessionStorage.setItem(
      draftStorageKey("u-1", "meeting:1", "notes"),
      '{"text":"minutes"}',
    );
    window.sessionStorage.setItem("unrelated", "kept");

    render(<SignOutView />);
    await act(async () => {});

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(windowStorageKey("u-1"))).toBeNull();
    expect(
      window.sessionStorage.getItem(
        draftStorageKey("u-1", "meeting:1", "notes"),
      ),
    ).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("kept");
  });

  it("forgets this device's push token while the session still exists", async () => {
    let finish!: () => void;
    forgetDeviceToken.mockReturnValue(
      new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<SignOutView />);
    expect(forgetDeviceToken).toHaveBeenCalledTimes(1);
    // The DELETE needs the session: sign-out waits for it.
    await act(async () => {});
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out anyway when the token cleanup is slow", async () => {
    vi.useFakeTimers();
    forgetDeviceToken.mockReturnValue(new Promise<void>(() => {}));
    render(<SignOutView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
