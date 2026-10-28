import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The member panel's Sign-in card (owner's mock-up, step 7): confirm, send,
// then Sent with the time, Send another and a toast. A refusal stays in the
// dialog, beside the button that was pressed.

vi.mock("./actions", () => ({ sendPasswordResetLinkAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { sendPasswordResetLinkAction } from "./actions";
import { PasswordResetCard } from "./password-reset-card";
import { maskEmail } from "./reset-copy";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function card() {
  render(
    <PasswordResetCard userId="m1" name="Lerato" email="lerato.m@gmail.com" />,
  );
}

describe("PasswordResetCard", () => {
  it("asks first, naming a masked address, and sends nothing until Send link", async () => {
    card();
    fireEvent.click(
      screen.getByRole("button", { name: "Send password reset link" }),
    );
    expect(screen.getByText("Send Lerato a password reset link?")).toBeTruthy();
    expect(
      screen.getByText(/We email a link to lerato•••@gmail\.com\./),
    ).toBeTruthy();
    expect(screen.queryByText(/lerato\.m@gmail\.com/)).toBeNull();
    expect(sendPasswordResetLinkAction).not.toHaveBeenCalled();
  });

  it("sends, shows Sent with Send another, and toasts", async () => {
    vi.mocked(sendPasswordResetLinkAction).mockResolvedValue({
      ok: true,
      sentAt: "2026-10-27T12:05:00.000Z",
    });
    card();
    fireEvent.click(
      screen.getByRole("button", { name: "Send password reset link" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    await waitFor(() => expect(screen.getByText("Sent")).toBeTruthy());
    expect(sendPasswordResetLinkAction).toHaveBeenCalledWith("m1");
    // 12:05 UTC is 14:05 in camp time.
    expect(
      screen.getByText(/Today at 14:05\. The link works for 1 hour\./),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send another" })).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Reset link sent to Lerato.");
  });

  it("keeps a refusal in the dialog", async () => {
    vi.mocked(sendPasswordResetLinkAction).mockResolvedValue({
      ok: false,
      error: "Too many reset links for now. Wait an hour and try again.",
    });
    card();
    fireEvent.click(
      screen.getByRole("button", { name: "Send password reset link" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    await waitFor(() =>
      expect(screen.getByText(/Too many reset links for now/)).toBeTruthy(),
    );
    expect(screen.queryByText("Sent")).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("maskEmail", () => {
  it("keeps enough to recognise and hides the rest", () => {
    expect(maskEmail("lerato.m@gmail.com")).toBe("lerato•••@gmail.com");
    expect(maskEmail("ab@x.org")).toBe("a•••@x.org");
    expect(maskEmail("nonsense")).toBe("•••");
  });
});
