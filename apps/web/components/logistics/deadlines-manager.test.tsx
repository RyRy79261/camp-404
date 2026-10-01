import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The captains' AfrikaBurn dates on the camp's year page (owner, 2026-10-01,
// mock-up A). AfrikaBurn's standard dates are listed in their groups before
// anyone sets one. Each row's one button sits in the same place (RowActions,
// #323): "Set the date" until it is set, then "Change". The Done column's
// tick says what it is for ("<name> done"), and is off until there is a date.
// An "Other" date keeps Remove in its dialog, behind a confirm.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock(
  "@/app/(console)/captains/camp-settings/cycle/deadline-actions",
  () => ({
    addDeadlineAction: vi.fn(),
    editDeadlineAction: vi.fn(),
    removeDeadlineAction: vi.fn(),
    setAfrikaburnDateAction: vi.fn(),
    setDeadlineDoneAction: vi.fn(async () => ({
      ok: true,
      data: { calendar: "synced" },
    })),
  }),
);
vi.mock("@/app/(console)/logistics/actions", () => ({
  saveLogisticsPhaseAction: vi.fn(),
  clearLogisticsPhaseAction: vi.fn(),
}));

import { AFRIKABURN_DATES } from "@camp404/core";
import { setDeadlineDoneAction } from "@/app/(console)/captains/camp-settings/cycle/deadline-actions";
import { DEADLINES_ANCHOR } from "@/lib/logistics-copy";
import { DeadlinesManager, type DeadlineItem } from "./deadlines-manager";

const BASE: Omit<DeadlineItem, "id" | "title" | "kind"> = {
  dueDate: "2027-03-01",
  note: null,
  done: false,
  skipped: false,
  version: 1,
  calendar: "on",
};
const DEADLINES: DeadlineItem[] = [
  {
    ...BASE,
    id: "d1",
    kind: "form_2",
    title: "Form 2 registration",
    done: true,
  },
  {
    ...BASE,
    id: "d2",
    kind: "second_ddt_round",
    title: "Second DDT round",
    dueDate: null,
    skipped: true,
  },
  { ...BASE, id: "d3", kind: null, title: "Mutant vehicle forms" },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (name: string) => screen.getByRole("listitem", { name });

describe("DeadlinesManager", () => {
  it("lists every standard date in its group, at the year page's #deadlines", () => {
    render(<DeadlinesManager deadlines={[]} />);
    for (const d of AFRIKABURN_DATES) {
      expect(row(d.name).textContent).toContain("Not announced yet");
    }
    expect(
      within(screen.getByRole("region", { name: "Tickets (DDT)" }))
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual([
      "Ticket distribution opens",
      "DDT deadline",
      "Second DDT round",
      "Ticket distribution closes",
    ]);
    expect(
      screen
        .getByRole("region", { name: "Theme camp registration" })
        .closest(`#${DEADLINES_ANCHOR}`),
    ).toBeTruthy();
  });

  it("keeps one button in the row's action slot: Set the date, then Change", () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    for (const [name, label] of [
      ["Registration closes", "Set the date for Registration closes"],
      ["Form 2 registration", "Change Form 2 registration"],
      ["Second DDT round", "Change Second DDT round"],
      ["Mutant vehicle forms", "Change Mutant vehicle forms"],
    ] as const) {
      const actions = within(row(name)).getByRole("group", {
        name: `Actions for ${name}`,
      });
      expect(within(actions).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(row("Second DDT round").textContent).toContain("No round this year");
  });

  it("ticks done with the version it saw; no tick until there is a date", async () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    const unset = within(row("Registration closes")).getByRole("checkbox", {
      name: "Registration closes done",
    });
    expect(unset.hasAttribute("disabled")).toBe(true);
    const skipped = within(row("Second DDT round")).getByRole("checkbox", {
      name: "Second DDT round done",
    });
    expect(skipped.hasAttribute("disabled")).toBe(true);
    fireEvent.click(
      within(row("Mutant vehicle forms")).getByRole("checkbox", {
        name: "Mutant vehicle forms done",
      }),
    );
    await waitFor(() =>
      expect(setDeadlineDoneAction).toHaveBeenCalledWith({
        id: "d3",
        done: true,
        expectedVersion: 1,
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("says the calendar title in the Set dialog, and offers no round only where allowed", () => {
    render(<DeadlinesManager deadlines={[]} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Set the date for Registration closes",
      }),
    );
    let dialog = screen.getByRole("dialog", {
      name: "Set the date · Registration closes",
    });
    expect(dialog.textContent).toContain(
      "Goes on the camp calendar as “AfrikaBurn: Registration closes”.",
    );
    expect(
      within(dialog).queryByRole("checkbox", { name: "No round this year" }),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Set the date for Second DDT round" }),
    );
    dialog = screen.getByRole("dialog", {
      name: "Set the date · Second DDT round",
    });
    expect(
      within(dialog).getByRole("checkbox", { name: "No round this year" }),
    ).toBeTruthy();
  });

  it("keeps an Other date's Remove in its dialog, behind a confirm", () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    expect(
      within(row("Mutant vehicle forms")).queryByRole("button", {
        name: /Remove/,
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Mutant vehicle forms" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Change · Mutant vehicle forms",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(
      screen.getByRole("dialog", { name: "Remove this date?" }),
    ).toBeTruthy();
  });

  it("says nothing about the calendar on a date that is on it", () => {
    render(
      <DeadlinesManager
        deadlines={[
          ...DEADLINES,
          {
            ...BASE,
            id: "d4",
            kind: null,
            title: "MOOP report due",
            calendar: "pending",
          },
        ]}
      />,
    );
    expect(row("Form 2 registration").textContent).not.toContain(
      "camp calendar",
    );
    expect(row("MOOP report due").textContent).toContain(
      "Not on the camp calendar yet",
    );
  });
});
