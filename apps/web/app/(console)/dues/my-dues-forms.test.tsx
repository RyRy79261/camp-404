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

// A below-tier pledge is shown back the way the member typed it, with a comma
// for cents, like every other money form, not as a JavaScript number.

describe("PledgeForm", () => {
  it("shows a saved below-tier pledge with a comma for the cents", () => {
    render(
      <PledgeForm
        tiers={[{ id: "t1", label: "Standard", amountCents: 300000 }]}
        pledge={{ tierId: null, amountCents: 125050 }}
        locked={false}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>(
      "What you can pay (R)",
    );
    expect(input.value).toBe("1250,50");
  });
});
