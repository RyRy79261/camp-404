import {
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
const previewStatementAction = vi.fn();
const confirmStatementLineAction = vi.fn();
vi.mock("../dues-actions", () => ({
  previewStatementAction: (...a: unknown[]) => previewStatementAction(...a),
  confirmStatementLineAction: (...a: unknown[]) =>
    confirmStatementLineAction(...a),
}));

import { StatementImport } from "./statement-import";

// The statement import (#240): a line with no reference whose amount matches
// one member's proof names that member in its chip but never picks them, so
// one tap cannot mark someone else's money as theirs; once the Finance team
// picks them, the button says it marks their payment received.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ADA = { id: "u1", name: "Ada", refCode: "C404-M017" };

async function readWithSuggestion() {
  previewStatementAction.mockResolvedValue({
    ok: true,
    data: {
      proposals: [
        {
          row: 2,
          date: "2027-01-15",
          amountCents: 125_000,
          description: "EFT",
          memberRef: null,
          member: ADA,
          matchedBy: "amount",
          pendingPaymentId: "p1",
          alreadyRecorded: false,
        },
      ],
      skippedOutgoing: 0,
      skippedUnreadable: 0,
      members: [ADA],
    },
  });
  render(<StatementImport />);
  fireEvent.change(screen.getByLabelText("Statement file"), {
    target: { files: [new File(["x"], "s.csv", { type: "text/csv" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Read the statement" }));
  await waitFor(() =>
    expect(
      screen.getByRole("list", { name: "Statement payments" }),
    ).toBeTruthy(),
  );
}

describe("StatementImport", () => {
  it("suggests a member by amount without picking them", async () => {
    await readWithSuggestion();
    const select = screen.getByRole("combobox", {
      name: /Member for the payment/,
    }) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText(/Same amount as Ada's proof/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Record" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("says Mark received once the team picks the suggested member", async () => {
    confirmStatementLineAction.mockResolvedValue({
      ok: true,
      data: { reference: null },
    });
    await readWithSuggestion();
    fireEvent.change(
      screen.getByRole("combobox", { name: /Member for the payment/ }),
      { target: { value: "u1" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark received" }));
    await waitFor(() =>
      expect(confirmStatementLineAction).toHaveBeenCalledExactlyOnceWith({
        kind: "reconcile",
        paymentId: "p1",
      }),
    );
  });
});
