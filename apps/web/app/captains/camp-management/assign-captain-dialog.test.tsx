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
      requestedByName={null}
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
      requestIsMine: true,
      requestedByName: "Captain Jo",
    });
    const { onSent } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith({
        requestId: "req-1",
        requestIsMine: true,
        requestedByName: "Captain Jo",
      }),
    );
  });

  it("passes on that the open request was another captain's", async () => {
    // Send is idempotent: a second captain gets the first captain's request.
    vi.mocked(sendCaptainPromotionAction).mockResolvedValue({
      ok: true,
      requestId: "req-1",
      requestIsMine: false,
      requestedByName: "Captain Ada",
    });
    const { onSent } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith({
        requestId: "req-1",
        requestIsMine: false,
        requestedByName: "Captain Ada",
      }),
    );
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

  it("names the captain who sent it, and hides Cancel request, when it is not yours", () => {
    renderDialog({
      step: { sent: true, accepted: false },
      requestId: "req-1",
      requestIsMine: false,
      requestedByName: "Captain Ada",
    });
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
    expect(
      screen.getByText(/Requested by Captain Ada\. Only they can cancel it\./),
    ).toBeDefined();
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
