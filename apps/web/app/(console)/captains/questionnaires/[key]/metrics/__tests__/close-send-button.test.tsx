import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock("../../../actions", () => ({
  closeActivationAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { closeActivationAction } from "../../../actions";
import { CloseActivationButton } from "../close-send-button";

// Closing a send from the results page stops asking everyone who hasn't
// answered, so it confirms first, like the editor's Close send.

const ACT = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
});

function press() {
  render(<CloseActivationButton activationId={ACT} questionnaireKey="gear" />);
  fireEvent.click(screen.getByRole("button", { name: "Close send" }));
}

describe("CloseActivationButton", () => {
  it("closes the send once the captain confirms", async () => {
    vi.mocked(closeActivationAction).mockResolvedValue({ ok: true });
    press();
    await screen.findByText("Close the current send?");
    expect(closeActivationAction).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Close send" }).at(-1)!,
    );
    await waitFor(() =>
      expect(closeActivationAction).toHaveBeenCalledWith(ACT, "gear"),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Send closed");
  });

  it("closes nothing when the captain cancels", async () => {
    press();
    await screen.findByText("Close the current send?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Close the current send?")).toBeNull(),
    );
    expect(closeActivationAction).not.toHaveBeenCalled();
  });

  it("reports a refusal as a toast", async () => {
    vi.mocked(closeActivationAction).mockResolvedValue({
      ok: false,
      error: "Only captains can publish or send.",
    });
    press();
    await screen.findByText("Close the current send?");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Close send" }).at(-1)!,
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not close", {
        description: "Only captains can publish or send.",
      }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
