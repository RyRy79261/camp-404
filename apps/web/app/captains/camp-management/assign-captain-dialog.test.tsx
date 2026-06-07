import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  sendCaptainPromotionAction: vi.fn(),
  cancelCaptainPromotionAction: vi.fn(),
}));

import { AssignCaptainDialog } from "./assign-captain-dialog";
import {
  cancelCaptainPromotionAction,
  sendCaptainPromotionAction,
} from "./actions";

function renderDialog(props: Record<string, unknown> = {}) {
  const onSent = vi.fn();
  const onCancelled = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AssignCaptainDialog
      targetUserId="member-1"
      name="Nova"
      open
      onOpenChange={onOpenChange}
      step={{ sent: false, accepted: false }}
      requestId={null}
      requestIsMine={false}
      onSent={onSent}
      onCancelled={onCancelled}
      {...props}
    />,
  );
  return { onSent, onCancelled, onOpenChange };
}

describe("AssignCaptainDialog", () => {
  it("sends a request and reports the new request id", async () => {
    vi.mocked(sendCaptainPromotionAction).mockResolvedValue({
      ok: true,
      requestId: "req-1",
    });
    const { onSent } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("req-1"));
  });

  it("surfaces a send error inline", async () => {
    vi.mocked(sendCaptainPromotionAction).mockResolvedValue({
      ok: false,
      error: "They're already a captain.",
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /already a captain/,
      ),
    );
  });

  it("offers Cancel request once a request is in flight and cancels it", async () => {
    vi.mocked(cancelCaptainPromotionAction).mockResolvedValue({ ok: true });
    const { onCancelled } = renderDialog({
      step: { sent: true, accepted: false },
      requestId: "req-1",
      requestIsMine: true,
    });
    // The send affordance is replaced by Cancel request.
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(cancelCaptainPromotionAction).toHaveBeenCalledWith("req-1");
  });

  it("hides Cancel request when the request belongs to another captain", () => {
    renderDialog({
      step: { sent: true, accepted: false },
      requestId: "req-1",
      requestIsMine: false,
    });
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("hides Cancel request once the request has been accepted", () => {
    renderDialog({
      step: { sent: true, accepted: true },
      requestId: "req-1",
      requestIsMine: true,
    });
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });
});
