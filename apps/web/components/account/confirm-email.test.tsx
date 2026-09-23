import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The confirm-email card: the only way a member moved from Neon Auth with a
// password can prove their address, which camp emails, Google sign-in and
// GOD_EMAILS recovery all need.

const sendVerificationEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({
  authClient: { sendVerificationEmail },
}));

import { ConfirmEmail } from "./confirm-email";

const EMAIL = "moved@example.com";

// Braces matter: a beforeEach that returns a function (mockReset returns the
// mock) has it called as a cleanup hook after the test.
beforeEach(() => {
  sendVerificationEmail.mockReset();
});
afterEach(cleanup);

function press() {
  fireEvent.click(screen.getByRole("button", { name: "Confirm my email" }));
}

describe("ConfirmEmail", () => {
  it("sends the link to the member's own address and says where it went", async () => {
    sendVerificationEmail.mockResolvedValue({ data: { status: true } });
    render(
      <ConfirmEmail
        email={EMAIL}
        deliverable
        callbackURL="/profile/security"
      />,
    );
    press();

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(
      `We’ve sent a link to ${EMAIL}. It expires in an hour.`,
    );
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: EMAIL,
      callbackURL: "/profile/security",
    });
    expect(
      screen.queryByRole("button", { name: "Confirm my email" }),
    ).toBeNull();
  });

  it("asks the member to wait when the auth server rate-limits", async () => {
    sendVerificationEmail.mockResolvedValue({
      error: { status: 429, message: "Too many requests" },
    });
    render(<ConfirmEmail email={EMAIL} deliverable callbackURL="/" />);
    press();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many requests. Wait a minute and try again.",
    );
    expect(screen.queryByRole("status")).toBeNull();
    // The button stays, so they can try again.
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm my email",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });

  it("reports any other failure inline in the card", async () => {
    sendVerificationEmail.mockRejectedValue(new Error("network"));
    render(<ConfirmEmail email={EMAIL} deliverable callbackURL="/" />);
    press();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Couldn't send the link. Try again in a moment.",
      ),
    );
  });

  it("says why it can't confirm when the camp has no email, with no button", () => {
    render(<ConfirmEmail email={EMAIL} deliverable={false} callbackURL="/" />);
    expect(
      screen.getByText(
        "This camp has not set up email yet, so your address can't be confirmed. Ask a captain.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
