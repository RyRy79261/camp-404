import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The sign-up form is the one place Camp 404 chooses a new password, so it is
// the one place the minimum under the meter has to be true.

const signUpEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail }, signIn: { social: vi.fn() } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { PASSWORD_MIN_LENGTH } from "@camp404/ui/lib/form-logic";
import { SignUpForm } from "../sign-up-form";

const LONG = "correct horse battery staple";
const SHORT = "hunter2";

function fill(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "new@camp-404.com" },
  });
  fireEvent.change(document.getElementById("signup-password")!, {
    target: { value: password },
  });
  fireEvent.change(document.getElementById("signup-confirm-password")!, {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

beforeEach(() => {
  signUpEmail.mockReset();
  signUpEmail.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("SignUpForm password rules", () => {
  it("refuses a password shorter than the minimum, and never calls sign-up", async () => {
    expect(SHORT.length).toBeLessThan(PASSWORD_MIN_LENGTH);
    render(<SignUpForm googleEnabled />);
    fill(SHORT);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      ),
    );
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("accepts one at the minimum", async () => {
    expect(LONG.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    render(<SignUpForm googleEnabled />);
    fill(LONG);
    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect(signUpEmail.mock.calls[0]![0]).toMatchObject({
      email: "new@camp-404.com",
      password: LONG,
    });
  });

  it("still reports a mismatch on two long passwords", async () => {
    render(<SignUpForm googleEnabled />);
    fill(LONG, `${LONG} not`);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Passwords do not match",
      ),
    );
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("scores the password as it is typed, and only the password", () => {
    render(<SignUpForm googleEnabled />);
    fireEvent.change(document.getElementById("signup-password")!, {
      target: { value: SHORT },
    });
    expect(
      screen.getByText(
        `Too short — use at least ${PASSWORD_MIN_LENGTH} characters`,
      ),
    ).toBeTruthy();

    fireEvent.change(document.getElementById("signup-password")!, {
      target: { value: LONG },
    });
    expect(screen.queryByText(/use at least/)).toBeNull();

    // The confirm field carries no meter of its own.
    fireEvent.change(document.getElementById("signup-confirm-password")!, {
      target: { value: SHORT },
    });
    expect(screen.queryByText(/Too short/)).toBeNull();
  });

  it("reveals each password field independently", () => {
    render(<SignUpForm googleEnabled />);
    const [first, second] = screen.getAllByRole("button", {
      name: "Show password",
    });
    fireEvent.click(first!);
    expect(
      (document.getElementById("signup-password") as HTMLInputElement).type,
    ).toBe("text");
    expect(
      (document.getElementById("signup-confirm-password") as HTMLInputElement)
        .type,
    ).toBe("password");
    expect(second!.getAttribute("aria-label")).toBe("Show password");
  });
});

describe("SignUpForm, an address that already has an account", () => {
  it("points to sign-in and reset instead of Better Auth's raw message", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: {
        status: 422,
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "User already exists. Use another email.",
      },
    });
    render(<SignUpForm googleEnabled />);
    fill(LONG);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "There's already an account with that email. Sign in instead, or reset your password if you've forgotten it.",
      ),
    );
  });

  it("passes any other refusal through as the server wrote it", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { status: 400, code: "INVALID_EMAIL", message: "Invalid email" },
    });
    render(<SignUpForm googleEnabled />);
    fill(LONG);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Invalid email"),
    );
  });
});
