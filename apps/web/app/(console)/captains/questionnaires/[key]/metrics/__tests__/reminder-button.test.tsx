import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../actions", () => ({
  remindPendingAction: vi.fn(),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { ReminderButton } from "../reminder-button";
import { remindPendingAction } from "../../../actions";

// The button's job is to make the server's answer VISIBLE. A toast is right for
// "reminded 6 members" and wrong for "nothing was sent, and here is why" — the
// second has to outlive the toast, so it is also written into the live region.

const ACT = "44444444-4444-4444-8444-444444444444";

function renderButton(outstanding = 3) {
  return render(
    <ReminderButton activationId={ACT} outstanding={outstanding} />,
  );
}

function press() {
  fireEvent.click(
    screen.getByRole("button", { name: /remind who hasn.t answered/i }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReminderButton", () => {
  it("says how many are outstanding, and that the window exists", () => {
    renderButton(3);
    expect(screen.getByRole("status").textContent).toContain(
      "3 members haven't answered yet",
    );
    expect(screen.getByRole("status").textContent).toContain("24 hours");
  });

  it("still offers the nudge when the count says everyone answered", () => {
    // The count came off a server render that may be minutes stale, so it is
    // caption copy only — disabling on it would let a stale number hide a
    // working feature. The server is the one that decides.
    renderButton(0);
    expect(
      screen.getByRole("button", { name: /remind who hasn.t answered/i }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Everyone who was asked has answered.",
    );
  });

  it("toasts a success and keeps the count on screen", async () => {
    vi.mocked(remindPendingAction).mockResolvedValue({
      ok: true,
      sent: 4,
      message: "Reminded 4 members.",
    });
    renderButton();
    press();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Reminded 4 members."),
    );
    expect(remindPendingAction).toHaveBeenCalledWith(ACT);
    expect(screen.getByRole("status").textContent).toBe("Reminded 4 members.");
  });

  it("leaves the 'why nothing sent' reason on the page, not just in a toast", async () => {
    const why =
      "All 3 members still outstanding were reminded in the last 24 hours, so nothing was sent. You can nudge again from Mon, 09:00.";
    vi.mocked(remindPendingAction).mockResolvedValue({
      ok: true,
      sent: 0,
      message: why,
    });
    renderButton();
    press();

    // A no-op is INFORMATION, not success and not failure.
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(why));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    // …and it is still readable once the toast has gone.
    expect(screen.getByRole("status").textContent).toBe(why);
  });

  it("shows a refusal as an error and keeps the caption honest", async () => {
    vi.mocked(remindPendingAction).mockResolvedValue({
      ok: false,
      error: "Only captains can publish or send.",
    });
    renderButton(2);
    press();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Only captains can publish or send.",
      ),
    );
    // The refusal is not written into the caption — that line describes who is
    // outstanding, and a failed attempt changed nothing about that.
    expect(screen.getByRole("status").textContent).toContain(
      "2 members haven't answered yet",
    );
  });
});
