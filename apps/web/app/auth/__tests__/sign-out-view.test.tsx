import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  draftStorageKey,
  windowStorageKey,
} from "@/components/os/window-storage";
import { SignOutView } from "../sign-out-view";

// Erasure reaches /auth/sign-out by a server redirect, never through
// SignOutLink: the page itself must forget the tab's desktop and drafts.

const signOut = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut } }));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("SignOutView", () => {
  it("forgets the tab's windows and editor drafts before signing out", () => {
    window.sessionStorage.setItem(windowStorageKey("u-1"), "[]");
    window.sessionStorage.setItem(
      draftStorageKey("u-1", "meeting:1", "notes"),
      '{"text":"minutes"}',
    );
    window.sessionStorage.setItem("unrelated", "kept");

    render(<SignOutView />);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(windowStorageKey("u-1"))).toBeNull();
    expect(
      window.sessionStorage.getItem(
        draftStorageKey("u-1", "meeting:1", "notes"),
      ),
    ).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("kept");
  });
});
