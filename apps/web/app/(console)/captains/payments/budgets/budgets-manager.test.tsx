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
// never an old draft left by Cancel or a budget someone else changed since; a
// viewer who may only read gets the same figures with no pencil at all.

afterEach(cleanup);

function row(
  key: string,
  label: string,
  budgetCents: number | null,
): BudgetRow {
  return {
    ...budgetTotals(budgetCents, []),
    key,
    label,
    archived: false,
  };
}

function show(budgetCents: number | null, canEdit = true) {
  return (
    <BudgetsManager
      yearLabel="2027"
      rows={[
        row("kitchen", "Kitchen", budgetCents),
        row("sound", "Sound", null),
      ]}
      totals={{
        budgetCents: budgetCents ?? 0,
        spentCents: 0,
        leftCents: budgetCents,
        waitingCents: 0,
        waitingCount: 0,
      }}
      canEdit={canEdit}
    />
  );
}

/** Both layouts are in the DOM (CSS picks one); the first is the table. */
function edit(label: string) {
  fireEvent.click(
    screen.getAllByRole("button", { name: `Edit ${label}'s budget` })[0]!,
  );
}

describe("BudgetsManager", () => {
  it("starts each edit from the current budget", () => {
    const { rerender } = render(show(500_00));
    const field = () =>
      screen.getByLabelText("Kitchen budget (R)") as HTMLInputElement;

    edit("Kitchen");
    expect(field().value).toBe("500");
    fireEvent.change(field(), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    edit("Kitchen");
    expect(field().value).toBe("500");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Someone else set it to R800 and the page refreshed.
    rerender(show(800_00));
    edit("Kitchen");
    expect(field().value).toBe("800");
  });

  it("refuses an amount that is not rands, beside the field", () => {
    render(show(500_00));
    edit("Kitchen");
    fireEvent.change(screen.getByLabelText("Kitchen budget (R)"), {
      target: { value: "lots" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Type the budget in rands, like 5000 or 5000,50.",
    );
  });

  it("gives a reader the figures and who sets them, and no pencil", () => {
    render(show(500_00, false));
    expect(
      screen.queryAllByRole("button", { name: /Edit .*'s budget/ }),
    ).toHaveLength(0);
    expect(
      screen.getByText("Captains and Finance leads set the budgets."),
    ).toBeTruthy();
    expect(screen.getAllByText("No budget").length).toBeGreaterThan(0);
  });
});
