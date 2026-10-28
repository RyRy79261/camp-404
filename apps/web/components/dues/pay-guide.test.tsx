import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campDayKey } from "@camp404/core";
import { EMPTY_CAMP_BANK_DETAILS } from "@camp404/types";

vi.mock("@/app/(console)/dues/my-dues-forms", () => ({
  ProofDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import {
  HowToPayButton,
  PayGuideOverlay,
  PayGuideProvider,
  type PayGuideData,
} from "./pay-guide";
import { dayAfter, PAY_GUIDE_HIDDEN_KEY } from "@/lib/pay-guide-hidden";

// The pay guide (mock-up step 4, Option A): it talks about the NEXT payment,
// shows the member's reference and the camp's bank from South Africa or from
// abroad, and "Remind me tomorrow" hides it until the next camp day in this
// browser (a day only). The desktop card and the phone banner are CSS twins
// (max-md:hidden / md:hidden); jsdom draws no CSS, so both are in the DOM
// and each query is scoped to one. Intl writes no-break spaces, so money is
// matched with \s.

const DATA: PayGuideData = {
  refCode: "C404-M017",
  feeTotalCents: 720_000,
  paidCents: 0,
  next: {
    kind: "due",
    dueOn: "2026-11-30",
    amountCents: 360_000,
    overdue: false,
    first: true,
    source: "pledge",
  },
  bank: {
    southAfrica: {
      bank: "FNB",
      accountName: "Camp 404",
      accountNumber: "62800000000",
      branchCode: "250655",
    },
    abroad: {
      swift: "FIRNZAJJ",
      accountNumber: null,
      bankAddress: "First National Bank, Johannesburg",
      note: "Banks take fees on the way: choose OUR, or add R150.",
    },
  },
};

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function guide(data: PayGuideData | null = DATA, covered = false) {
  return render(
    <PayGuideProvider data={data}>
      <PayGuideOverlay covered={covered} />
      {data && <HowToPayButton data={data} />}
    </PayGuideProvider>,
  );
}

function card(container: HTMLElement) {
  return container.querySelector<HTMLElement>("[data-pay-guide]");
}

describe("the pay guide", () => {
  it("talks about the next payment, not the whole fee", () => {
    const { container } = guide();
    const c = card(container)!;
    expect(c.textContent).toMatch(/R\s3\s600,00 is due by 30 Nov/);
    expect(c.textContent).toMatch(
      /Your first payment\. You have paid R\s0,00 of R\s7\s200,00\./,
    );
  });

  it("opens to the reference and the bank, from South Africa or abroad", () => {
    const { container } = guide();
    fireEvent.click(screen.getByRole("button", { name: "Show me how to pay" }));
    const c = card(container)!;
    expect(c.textContent).toMatch(
      /Your first payment of R\s3\s600,00 is due by 30 Nov\./,
    );
    expect(c.textContent).toContain("C404-M017");
    expect(c.querySelector("button[aria-label='Copy C404-M017']")).toBeTruthy();
    const za = c.querySelector(
      "dl[aria-label='Bank details from South Africa']",
    );
    expect(za?.textContent).toContain("250655");
    expect(za?.textContent).toMatch(/AmountR\s3\s600,00/);

    const abroad = Array.from(c.querySelectorAll("button")).find(
      (b) => b.textContent === "From abroad",
    )!;
    fireEvent.click(abroad);
    const dl = c.querySelector("dl[aria-label='Bank details from abroad']");
    expect(dl?.textContent).toContain("FIRNZAJJ");
    // No abroad account number typed: the South African one is the account.
    expect(dl?.textContent).toContain("62800000000");
    expect(c.textContent).toContain("South Africa has no IBAN");
    expect(c.textContent).toContain("choose OUR, or add R150");
  });

  it("says so when Finance has not typed the bank details", () => {
    const { container } = guide({ ...DATA, bank: EMPTY_CAMP_BANK_DETAILS });
    fireEvent.click(screen.getByRole("button", { name: "Show me how to pay" }));
    expect(card(container)!.textContent).toContain(
      "hasn’t put the bank details here yet",
    );
  });

  it("hides until tomorrow, storing only the day", () => {
    const { container } = guide();
    const button = Array.from(card(container)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Remind me tomorrow",
    )!;
    fireEvent.click(button);
    expect(card(container)).toBeNull();
    expect(container.querySelector("[data-pay-guide-banner]")).toBeNull();
    const stored = window.localStorage.getItem(PAY_GUIDE_HIDDEN_KEY);
    expect(stored).toBe(dayAfter(campDayKey(new Date())));
  });

  it("stays hidden on a day before the stored one, and comes back after", () => {
    window.localStorage.setItem(
      PAY_GUIDE_HIDDEN_KEY,
      dayAfter(campDayKey(new Date())),
    );
    const first = guide();
    expect(card(first.container)).toBeNull();
    first.unmount();
    window.localStorage.setItem(PAY_GUIDE_HIDDEN_KEY, "2000-01-01");
    expect(card(guide().container)).not.toBeNull();
  });

  it("opens from My dues' How to pay even when hidden", () => {
    window.localStorage.setItem(PAY_GUIDE_HIDDEN_KEY, "9999-01-01");
    const { container } = guide();
    expect(card(container)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to pay" }));
    expect(card(container)!.textContent).toMatch(/Your first payment of/);
    expect(
      screen.getByRole("region", { name: "How to pay your camp fee" }),
    ).toBeTruthy();
  });

  it("keeps the phone banner out of a covering program's way", () => {
    const open = guide();
    expect(
      open.container.querySelector("[data-pay-guide-banner]"),
    ).not.toBeNull();
    open.unmount();
    const covered = guide(DATA, true);
    expect(
      covered.container.querySelector("[data-pay-guide-banner]"),
    ).toBeNull();
  });

  it("draws nothing without data", () => {
    const { container } = guide(null);
    expect(container.innerHTML).toBe("");
  });

  it("outside the desktop, How to pay opens the same guide in a dialog", () => {
    render(<HowToPayButton data={DATA} />);
    fireEvent.click(screen.getByRole("button", { name: "How to pay" }));
    const dialog = screen.getByRole("dialog", { name: "How to pay" });
    expect(dialog.textContent).toMatch(
      /Your first payment of R\s3\s600,00 is due by 30 Nov\./,
    );
  });
});
