import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../dues-actions", () => ({
  publishSettleUpAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SettleUpForm } from "./settle-up-form";

// The settle-up: the split is shown before the button, and the button says
// what pressing it does, with the share and how many members. It stays
// disabled until there is a reason and a total. Money text carries no-break
// spaces from Intl, so it is matched with \s.

afterEach(cleanup);

const CANDIDATES = [
  { userId: "a", name: "Ada", concession: false },
  { userId: "b", name: "Bo", concession: true },
  { userId: "c", name: "Cy", concession: false },
  { userId: "d", name: "Dee", concession: false },
  { userId: "e", name: "Eli", concession: false },
];

describe("SettleUpForm", () => {
  it("names the result on the button, after the split", () => {
    render(<SettleUpForm candidates={CANDIDATES} />);
    const waiting = screen.getByRole("button", {
      name: "Add to members' dues",
    });
    expect(waiting).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("What it is for"), {
      target: { value: "Gas and water" },
    });
    fireEvent.change(screen.getByLabelText("Total (R)"), {
      target: { value: "4200" },
    });
    const button = screen.getByRole("button", {
      name: /^Add R\s840,00 to 5 members' dues$/,
    });
    expect(button).toHaveProperty("disabled", false);

    // The split comes first in reading order.
    const split = screen.getByRole("list", {
      name: "Members in the settle-up",
    });
    expect(
      split.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves out the members whose fee was lowered, in plain words", () => {
    render(<SettleUpForm candidates={CANDIDATES} />);
    fireEvent.change(screen.getByLabelText("What it is for"), {
      target: { value: "Gas" },
    });
    fireEvent.change(screen.getByLabelText("Total (R)"), {
      target: { value: "400" },
    });
    fireEvent.click(
      screen.getByLabelText("Leave out members whose fee Finance lowered"),
    );
    expect(
      screen.getByRole("button", {
        name: /^Add R\s100,00 to 4 members' dues$/,
      }),
    ).toBeTruthy();
  });

  it("says money goes back when the camp has some left over", () => {
    render(<SettleUpForm candidates={CANDIDATES.slice(0, 1)} />);
    fireEvent.change(screen.getByLabelText("What it is for"), {
      target: { value: "Left over" },
    });
    fireEvent.change(screen.getByLabelText("Total (R)"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "They get money back" }));
    expect(
      screen.getByRole("button", {
        name: /^Give R\s50,00 back on 1 member's dues$/,
      }),
    ).toBeTruthy();
  });
});
