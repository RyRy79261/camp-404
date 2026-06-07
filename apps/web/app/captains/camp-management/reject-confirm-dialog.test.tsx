import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RejectConfirmDialog } from "./reject-confirm-dialog";

describe("RejectConfirmDialog", () => {
  it("confirms a rejection", () => {
    const onConfirm = vi.fn();
    render(
      <RejectConfirmDialog
        name="Nova"
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        pending={false}
      />,
    );
    expect(screen.getByText(/Reject Nova's application\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("keeps pending without confirming", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <RejectConfirmDialog
        name="Nova"
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep pending" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables the actions and withholds the close button while a reject is in flight", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <RejectConfirmDialog
        name="Nova"
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        pending
      />,
    );
    // The Radix close (X) button is withheld mid-send.
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    // Both actions are disabled so the decision can't be double-fired or
    // abandoned. (The Reject button's name includes the Spinner's "Loading…".)
    expect(
      (screen.getByRole("button", { name: /Reject/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /Keep pending/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
