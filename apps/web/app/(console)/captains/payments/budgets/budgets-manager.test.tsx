import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetTotals } from "@camp404/core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("../claims-actions", () => ({ setBudgetAction: vi.fn() }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BudgetsManager, type BudgetRow } from "./budgets-manager";

// The Budgets tab (#242): an edit always starts from the budget as it is now,
// never an old draft left by Cancel or a budget someone else changed since.

afterEach(cleanup);

function row(budgetCents: number | null): BudgetRow {
  return {
    ...budgetTotals(budgetCents, []),
    key: "kitchen",
    label: "Kitchen",
    archived: false,
  };
}

function show(budgetCents: number | null) {
  return (
    <BudgetsManager
      yearLabel="2027"
      rows={[row(budgetCents)]}
      totals={{ budgetCents: budgetCents ?? 0, spentCents: 0, waitingCents: 0 }}
    />
  );
}

describe("BudgetsManager", () => {
  it("starts each edit from the current budget", () => {
    const { rerender } = render(show(500_00));
    const edit = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Edit Kitchen's budget" }),
      );
    const field = () =>
      screen.getByLabelText("Kitchen budget (R)") as HTMLInputElement;

    edit();
    expect(field().value).toBe("500");
    fireEvent.change(field(), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    edit();
    expect(field().value).toBe("500");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Someone else set it to R800 and the page refreshed.
    rerender(show(800_00));
    edit();
    expect(field().value).toBe("800");
  });
});
