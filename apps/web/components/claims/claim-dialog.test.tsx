import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ClaimDialog } from "./claim-dialog";

// "Claim money back" in a dialog (#242): while a claim is on its way the
// dialog stays open, so a refusal from the server shows to the member instead
// of vanishing with the form.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClaimDialog", () => {
  it("does not close mid-send, and shows the server's refusal", async () => {
    let answer: (r: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (answer = resolve))),
    );
    render(
      <ClaimDialog
        teams={[{ key: "kitchen", label: "Kitchen" }]}
        defaultTeam="kitchen"
        today="2027-03-02"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Claim money back" }));
    fireEvent.change(screen.getByLabelText("What you bought"), {
      target: { value: "Gas" },
    });
    fireEvent.change(screen.getByLabelText("Amount (R)"), {
      target: { value: "450" },
    });
    fireEvent.change(screen.getByLabelText("Bank details"), {
      target: { value: "FNB 123" },
    });
    fireEvent.change(screen.getByLabelText("Receipts"), {
      target: {
        files: [new File(["x"], "slip.jpg", { type: "image/jpeg" })],
      },
    });
    await screen.findByText(/1 of 5 files/);
    fireEvent.click(screen.getByRole("button", { name: "Send my claim" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => {
      answer({
        ok: false,
        json: async () => ({ error: "That file type isn't taken." }),
      });
    });
    await waitFor(() =>
      expect(screen.getByText("That file type isn't taken.")).toBeTruthy(),
    );
  });
});
