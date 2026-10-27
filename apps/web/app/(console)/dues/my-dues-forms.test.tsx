import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({
  requestMyRefundAction: vi.fn(),
  savePledgeAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PledgeForm } from "./my-dues-forms";

// A saved pledge is shown back in whole rands, the way the member typed it,
// with the "by when" and the subsidy answer they gave.

describe("PledgeForm", () => {
  it("shows a saved pledge back as the member typed it", () => {
    render(
      <PledgeForm
        burnYear={2027}
        pledge={{ amountCents: 720_000, payBy: "all_by_15_jan", subsidy: true }}
        locked={false}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>(
      "What you can commit (R)",
    );
    expect(input.value).toBe("7200");
    expect(
      screen
        .getByRole("radio", { name: "All of it by 15 January 2027" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});
