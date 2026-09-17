import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RejectConfirmDialog } from "./reject-confirm-dialog";

describe("RejectConfirmDialog", () => {
  it("confirms a rejection", () => {
    const onConfirm = vi.fn();
    render(
      <RejectConfirmDialog
        mode={{ kind: "application", name: "Nova" }}
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        reason=""
        onReasonChange={() => {}}
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
        mode={{ kind: "application", name: "Nova" }}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        reason=""
        onReasonChange={() => {}}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep pending" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports the reason as it is typed", () => {
    const onReasonChange = vi.fn();
    render(
      <RejectConfirmDialog
        mode={{ kind: "application", name: "Nova" }}
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        reason=""
        onReasonChange={onReasonChange}
        pending={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Reason for Nova (optional)"), {
      target: { value: "We are full this year." },
    });
    expect(onReasonChange).toHaveBeenCalledWith("We are full this year.");
  });

  it("disables the actions and withholds the close button while a reject is in flight", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <RejectConfirmDialog
        mode={{ kind: "application", name: "Nova" }}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        reason=""
        onReasonChange={() => {}}
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

  it("says the rejection can be re-opened, not that it is final", () => {
    render(
      <RejectConfirmDialog
        mode={{ kind: "application", name: "Nova" }}
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        reason=""
        onReasonChange={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByText(/You can re-open it later/)).toBeTruthy();
    expect(screen.queryByText(/can't be undone/)).toBeNull();
  });

  it("names what offboarding an approved member does", () => {
    const onConfirm = vi.fn();
    render(
      <RejectConfirmDialog
        mode={{ kind: "offboard", name: "Nova" }}
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        reason=""
        onReasonChange={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByText("Remove Nova from camp?")).toBeTruthy();
    expect(screen.getByText(/come off this year's teams/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove from camp" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("counts the applications in a bulk rejection", () => {
    render(
      <RejectConfirmDialog
        mode={{ kind: "bulk", count: 3 }}
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        reason=""
        onReasonChange={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByText("Reject 3 applications?")).toBeTruthy();
    expect(screen.getByLabelText("Reason for all 3 (optional)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject 3" })).toBeTruthy();
  });
});
