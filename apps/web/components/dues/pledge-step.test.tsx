import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(console)/dues/actions", () => ({ savePledgeAction: save }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PledgeStep } from "./pledge-step";

// "What can you commit?" (mock-up step 3) on the Join site's default scale:
// Essential R3,500 … Perfect World R16,000 at R16 = US$1, so the Recommended
// point (about US$450) is R7,200. Any whole-rand amount may be sent, more
// than Perfect World too; with the subsidy tick R0 is fine and "by when" is
// optional (the server's PledgeInput says the rest). Intl writes no-break
// spaces, so money is matched with \s.

const SCALE = DEFAULT_JOIN_CONTENT.fee;

afterEach(cleanup);
beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, data: { charged: false } });
});

function step(props: Partial<Parameters<typeof PledgeStep>[0]> = {}) {
  return render(
    <PledgeStep scale={SCALE} burnYear={2027} pledge={null} {...props} />,
  );
}

function amount() {
  return screen.getByTestId("pledge-amount").textContent;
}

describe("PledgeStep", () => {
  it("starts on the Recommended mark, in rands with the dollar label", () => {
    step();
    expect(amount()).toMatch(/^R\s7\s200,00$/);
    expect(screen.getByText("≈ US$450")).toBeTruthy();
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>("slider", {
        name: "What I can commit, in rands",
      }).value,
    ).toBe("7200");
  });

  it("takes a typed amount past Perfect World, the slider resting at its end", () => {
    step();
    fireEvent.change(screen.getByLabelText("Or type it (R)"), {
      target: { value: "20000" },
    });
    expect(amount()).toMatch(/^R\s20\s000,00$/);
    expect(screen.getByText("Near Perfect World")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("18000");
  });

  it("moves the typed box with the slider", () => {
    step();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "8000" } });
    expect(
      screen.getByLabelText<HTMLInputElement>("Or type it (R)").value,
    ).toBe("8000");
    expect(
      screen.getByText("Where we hope most people can land."),
    ).toBeTruthy();
  });

  it("sends the amount, the by-when and the subsidy answer", async () => {
    step();
    fireEvent.click(
      screen.getByRole("radio", { name: /Part by the end of November/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      amountCents: 720_000,
      payBy: "part_by_end_nov",
      subsidy: false,
    });
  });

  it("refuses cents beside the box, before anything is sent", () => {
    step();
    fireEvent.change(screen.getByLabelText("Or type it (R)"), {
      target: { value: "7200,50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Type a whole number of rands, like 7200.",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("with the subsidy tick, says R0 is fine and by-when is optional", async () => {
    step();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/R0 is fine, and/)).toBeTruthy();
    expect(screen.getByText("(optional)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Or type it (R)"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        amountCents: 0,
        payBy: null,
        subsidy: true,
      }),
    );
  });

  it("shows the server's refusal", async () => {
    save.mockResolvedValue({ ok: false, error: "Pick when you can pay it." });
    step();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Pick when you can pay it.",
    );
  });

  it("reads a saved pledge back as the member left it", () => {
    step({
      pledge: { amountCents: 500_000, payBy: "all_by_15_jan", subsidy: true },
    });
    expect(amount()).toMatch(/^R\s5\s000,00$/);
    expect(
      screen
        .getByRole("radio", { name: "All of it by 15 January 2027" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("keeps a charged fee's amount: no slider, no box", async () => {
    step({
      pledge: { amountCents: 720_000, payBy: "all_by_end_nov", subsidy: false },
      amountLocked: true,
      submitLabel: "Save",
    });
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByLabelText("Or type it (R)")).toBeNull();
    fireEvent.click(
      screen.getByRole("radio", { name: "All of it by the end of December" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        amountCents: 720_000,
        payBy: "all_by_end_dec",
        subsidy: false,
      }),
    );
  });
});
