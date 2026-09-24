import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// A Google sign-in that fails comes back to this form with `?error=<code>`
// (Better Auth's onAPIError.errorURL). The form shows a sentence in its alert
// slot, and nothing at all on a plain visit.

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signIn: { email: vi.fn(), social: vi.fn(), passkey: vi.fn() },
  },
}));

import { SignInForm } from "../sign-in-form";

beforeEach(() => {
  cleanup();
  search.value = "";
});

describe("SignInForm after a failed Google sign-in", () => {
  it("explains a refused link to an unconfirmed account", () => {
    search.value = "error=account_not_linked";
    render(<SignInForm googleEnabled />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("hasn't confirmed its email yet");
    expect(alert.textContent).not.toContain("account_not_linked");
  });

  it("never shows Better Auth's error_description", () => {
    search.value = "error=weird&error_description=Visit%20evil.example";
    render(<SignInForm googleEnabled />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Google sign-in didn't finish. Try again.");
  });

  it("shows no alert on a plain visit", () => {
    render(<SignInForm googleEnabled />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
