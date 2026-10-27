import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { campForecast, type CampBillLike } from "@camp404/core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const actions = vi.hoisted(() => ({
  addCampBillAction: vi.fn(async () => ({ ok: true, data: { id: "b" } })),
  updateCampBillAction: vi.fn(),
  removeCampBillAction: vi.fn(),
  markCampBillPaidAction: vi.fn(async () => ({
    ok: true,
    data: { paidCount: 1 },
  })),
  recordCampBalanceAction: vi.fn(async () => ({ ok: true, data: { id: "x" } })),
}));
vi.mock("../camp-money-actions", () => actions);
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { forecastRows, paidRows } from "@/lib/camp-money-view";
import { BankBalance } from "./bank-balance";
import { BillDialog } from "./bill-dialog";
import { MoneyLines, PaidLines } from "./money-lines";

// Camp money (camp fees sprint, mock-up step 1 B): the date-by-date rows with
// "Mark paid" on each bill's NEXT payment only, the add-a-bill dialog, and the
// bank balance with its history.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const R = (rands: number) => rands * 100;

const bills = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Storage unit",
    payee: "Paarden Eiland Storage",
    amountCents: R(4400),
    dueOn: "2026-11-15",
    repeat: "monthly" as const,
    times: 3,
    paidCount: 0,
    paidOn: null,
    planned: false,
    version: 1,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Tent hire deposit",
    payee: "Dimensions",
    amountCents: R(70000),
    dueOn: "2026-12-01",
    repeat: "once" as const,
    times: 1,
    paidCount: 0,
    paidOn: null,
    planned: false,
    version: 1,
  },
];

function rows() {
  const forecast = campForecast({
    balance: { amountCents: R(100000), asOf: "2026-10-25" },
    members: [],
    bills: bills as CampBillLike[],
    budgetsUnspentCents: R(1500),
    burnYear: 2027,
  });
  return forecastRows(forecast, bills);
}

describe("Camp money's date by date", () => {
  it("says what each line is, in the mock-up's words, with the money after", () => {
    const r = rows();
    expect(r.map((x) => [x.day, x.name, x.detail])).toEqual([
      ["15 Nov", "Storage unit", "monthly · Paarden Eiland Storage"],
      ["1 Dec", "Tent hire deposit", "Dimensions"],
      ["15 Dec", "Storage unit", null],
      ["15 Jan", "Storage unit", "last one"],
      ["—", "Team budgets not spent", null],
    ]);
    // The largest bill is the marked row.
    expect(r.filter((x) => x.highlight).map((x) => x.name)).toEqual([
      "Tent hire deposit",
    ]);
    expect(r.at(-1)!.moneyAfterCents).toBe(R(100000 - 3 * 4400 - 70000 - 1500));
  });

  it("offers Mark paid on a bill's next payment only, and marks that one", async () => {
    render(<MoneyLines rows={rows()} />);
    // Both layouts are in the DOM (CSS picks one): the table's come first.
    const buttons = screen.getAllByRole("button", { name: "Mark paid" });
    // Two bills, two layouts: the later storage months have none.
    expect(buttons).toHaveLength(4);
    await act(async () => {
      fireEvent.click(buttons[0]!);
    });
    expect(actions.markCampBillPaidAction).toHaveBeenCalledWith({
      billId: bills[0]!.id,
      expectedPaidCount: 0,
      paidOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("lists what is paid, with the day it was paid", () => {
    render(
      <PaidLines
        rows={paidRows([{ ...bills[1]!, paidCount: 1, paidOn: "2026-11-30" }])}
      />,
    );
    expect(screen.getAllByText("Tent hire deposit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("on 30 Nov 2026").length).toBeGreaterThan(0);
  });
});

describe("Add a bill", () => {
  it("sends what was typed, monthly with its months", async () => {
    render(<BillDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Add a bill" }));
    fireEvent.change(screen.getByLabelText("What it is for"), {
      target: { value: "Storage unit" },
    });
    fireEvent.change(screen.getByLabelText("Amount (R)"), {
      target: { value: "4400" },
    });
    fireEvent.change(screen.getByLabelText("Due"), {
      target: { value: "2026-11-15" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    fireEvent.change(screen.getByLabelText("For how many months"), {
      target: { value: "6" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add bill" }));
    });
    expect(actions.addCampBillAction).toHaveBeenCalledWith({
      name: "Storage unit",
      payee: "",
      amountCents: R(4400),
      dueOn: "2026-11-15",
      repeat: "monthly",
      times: 6,
      planned: false,
    });
  });

  it("says what is wrong beside the form, and sends nothing", async () => {
    render(<BillDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Add a bill" }));
    fireEvent.change(screen.getByLabelText("What it is for"), {
      target: { value: "Container" },
    });
    fireEvent.change(screen.getByLabelText("Amount (R)"), {
      target: { value: "lots" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add bill" }));
    expect(screen.getByRole("alert").textContent).toMatch(/in rands/);
    expect(actions.addCampBillAction).not.toHaveBeenCalled();
  });
});

describe("Bank balance", () => {
  it("saves a balance against the latest one seen, and lists every one", async () => {
    render(
      <BankBalance
        balances={[
          {
            id: "bal-2",
            amountCents: R(100000),
            asOf: "2026-10-25",
            recordedBy: "Caitlin",
          },
          {
            id: "bal-1",
            amountCents: R(96850),
            asOf: "2026-10-01",
            recordedBy: "Caitlin",
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Balances typed in" });
    expect(list.textContent).toContain("25 Oct 2026 · Caitlin");
    fireEvent.change(screen.getByLabelText("Balance (R)"), {
      target: { value: "-1250,50" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save balance" }));
    });
    await waitFor(() =>
      expect(actions.recordCampBalanceAction).toHaveBeenCalledWith({
        amountCents: -125_050,
        asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        expectedLatestId: "bal-2",
      }),
    );
  });
});
