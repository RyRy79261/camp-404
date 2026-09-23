import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /setup for an account that may not found the camp. On a fresh camp every
// signed-in visit lands here first, so a founder whose address is unconfirmed
// must be offered the confirm link on this page, or they have no way forward.

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  getAddressToConfirm: vi.fn(),
}));
vi.mock("@/lib/bootstrap", () => ({
  isCampBootstrapped: vi.fn(async () => false),
  mayFoundCamp: vi.fn(() => false),
  FOUNDER_CODE: "meowzit",
  SETUP_REFUSED_MESSAGE: "Only the founding address can set up.",
}));
vi.mock("@camp404/auth", () => ({ canDeliverAuthEmail: vi.fn(() => true) }));
vi.mock("./actions", () => ({ completeSetupAction: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
}));

import { canDeliverAuthEmail } from "@camp404/auth";
import { authClient } from "@/lib/auth-client";
import { getAddressToConfirm, getAuthenticatedUser } from "@/lib/auth";
import SetupPage from "./page";

function signedIn(emailVerified: boolean) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "u1",
    // An unconfirmed god address arrives with no primaryEmail.
    primaryEmail: emailVerified ? "someone@example.com" : null,
    displayName: "Founder",
    emailVerified,
  } as never);
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getAddressToConfirm).mockClear();
  vi.mocked(getAddressToConfirm).mockResolvedValue("founder@example.com");
  vi.mocked(canDeliverAuthEmail).mockReturnValue(true);
});

describe("/setup refusal", () => {
  it("offers an unconfirmed address the confirm link, landing back on /setup", async () => {
    signedIn(false);
    render(await SetupPage());
    expect(
      screen.getByText("Only the founding address can set up."),
    ).toBeTruthy();
    expect(screen.getByText("founder@example.com")).toBeTruthy();
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({
      data: { status: true },
      error: null,
    } as never);
    fireEvent.click(screen.getByRole("button", { name: "Confirm my email" }));
    await waitFor(() =>
      expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({
        email: "founder@example.com",
        callbackURL: "/setup",
      }),
    );
  });

  it("says who must set up email when the deployment cannot send it", async () => {
    signedIn(false);
    vi.mocked(canDeliverAuthEmail).mockReturnValue(false);
    render(await SetupPage());
    expect(screen.getByText(/can't send email yet/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Confirm my email" }),
    ).toBeNull();
  });

  it("shows a confirmed address that is not the founder's no Email card", async () => {
    signedIn(true);
    render(await SetupPage());
    expect(
      screen.getByText("Only the founding address can set up."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Confirm my email" }),
    ).toBeNull();
    expect(getAddressToConfirm).not.toHaveBeenCalled();
  });
});
