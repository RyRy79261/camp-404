import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CAMP_BANK_DETAILS } from "@camp404/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const save = vi.hoisted(() =>
  vi.fn(async () => ({ ok: false, error: "Someone changed it first." })),
);
vi.mock("../camp-money-actions", () => ({ saveCampBankDetailsAction: save }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BankDetailsForm } from "./bank-details-form";

// Finance settings' bank details (camp fees sprint): South Africa and abroad,
// saved against the version read; a refusal shows beside the form.

afterEach(cleanup);

describe("Where members pay", () => {
  it("sends both accounts against the version read, and shows a refusal", async () => {
    render(<BankDetailsForm details={EMPTY_CAMP_BANK_DETAILS} version={2} />);
    fireEvent.change(screen.getByLabelText("Bank"), {
      target: { value: "FNB" },
    });
    fireEvent.change(screen.getByLabelText("Branch code"), {
      target: { value: "250655" },
    });
    fireEvent.change(screen.getByLabelText("SWIFT code"), {
      target: { value: "FIRNZAJJ" },
    });
    fireEvent.change(screen.getByLabelText("Note on transfer fees"), {
      target: { value: "The sender pays the fees." },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save bank details" }),
      );
    });
    expect(save).toHaveBeenCalledWith({
      details: {
        southAfrica: {
          bank: "FNB",
          accountName: "",
          accountNumber: "",
          branchCode: "250655",
        },
        abroad: {
          swift: "FIRNZAJJ",
          accountNumber: "",
          bankAddress: "",
          note: "The sender pays the fees.",
        },
      },
      expectedVersion: 2,
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Someone changed it first.",
    );
  });
});
