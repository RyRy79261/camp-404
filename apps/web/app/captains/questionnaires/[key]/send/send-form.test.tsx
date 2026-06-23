import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../actions", () => ({
  sendAction: vi.fn(),
  closeActivationAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SendForm } from "./send-form";
import { closeActivationAction, sendAction } from "../../actions";

const members = [
  { id: "m1", label: "Ada", sub: "kitchen" },
  { id: "m2", label: "Grace", sub: "structures" },
];

function renderForm(openActivationId: string | null = null) {
  return render(
    <SendForm
      questionnaireKey="feedback"
      title="Feedback"
      members={members}
      openActivationId={openActivationId}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendAction).mockResolvedValue({ ok: true, activationId: "act1" });
  vi.mocked(closeActivationAction).mockResolvedValue({ ok: true });
});

describe("SendForm", () => {
  it("sends directly for a non-blocking everyone send", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({ scope: "everyone", blocking: false }),
    );
  });

  it("asks for confirmation before a blocking send to everyone", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("switch")); // turn blocking on
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));

    // The confirm dialog appears and nothing is sent yet.
    expect(
      await screen.findByText("Block everyone in camp?"),
    ).toBeTruthy();
    expect(sendAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send to everyone" }));
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({ scope: "everyone", blocking: true }),
    );
  });

  it("offers to close the current send instead of a form when one is open", async () => {
    renderForm("act1");
    expect(screen.getByText(/already sent/i)).toBeTruthy();
    // no scope picker is rendered in this state
    expect(screen.queryByLabelText(/Who should answer/i)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Close current send/i }),
    );
    await waitFor(() =>
      expect(closeActivationAction).toHaveBeenCalledWith("act1", "feedback"),
    );
    expect(sendAction).not.toHaveBeenCalled();
  });
});
