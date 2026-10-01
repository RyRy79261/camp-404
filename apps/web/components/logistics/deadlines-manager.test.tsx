import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The captains' AfrikaBurn deadlines on the camp's year page. Each row's
// buttons sit in one place (RowActions): "Mark done" is the one main button,
// with words that say what it does (never a bare tick box), a quiet Edit icon
// opens the dialog, and Remove lives in that dialog. A finished row wears a
// Done chip, and open ones come first.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock(
  "@/app/(console)/captains/camp-settings/cycle/deadline-actions",
  () => ({
    addDeadlineAction: vi.fn(),
    editDeadlineAction: vi.fn(),
    removeDeadlineAction: vi.fn(),
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

import { setDeadlineDoneAction } from "@/app/(console)/captains/camp-settings/cycle/deadline-actions";
import { DEADLINES_ANCHOR } from "@/lib/logistics-copy";
import { DeadlinesManager, type DeadlineItem } from "./deadlines-manager";

const BASE: Omit<DeadlineItem, "id" | "title"> = {
  dueDate: "2027-03-01",
  note: null,
  done: false,
  version: 1,
  calendar: "on",
};
const DEADLINES: DeadlineItem[] = [
  { ...BASE, id: "d1", title: "Theme camp registration closes", done: true },
  { ...BASE, id: "d2", title: "WAP applications close" },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (name: string) => screen.getByRole("listitem", { name });

describe("DeadlinesManager", () => {
  it("lists open deadlines first, and a done one wears a Done chip", () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    const list = screen.getByRole("list", { name: "AfrikaBurn deadlines" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["WAP applications close", "Theme camp registration closes"]);
    expect(
      within(row("Theme camp registration closes")).getByText("Done"),
    ).toBeTruthy();
    expect(
      within(row("WAP applications close")).queryByText("Done"),
    ).toBeNull();
    // The card is the year page's #deadlines, where Logistics sends captains.
    expect(list.closest(`#${DEADLINES_ANCHOR}`)).toBeTruthy();
  });

  it("gives each row one main button that says what it does, and no bare tick box", () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const open = within(row("WAP applications close")).getByRole("button", {
      name: "WAP applications close done",
    });
    expect(open.textContent).toBe("Mark done");
    expect(open.getAttribute("aria-pressed")).toBe("false");
    const done = within(row("Theme camp registration closes")).getByRole(
      "button",
      { name: "Theme camp registration closes done" },
    );
    expect(done.textContent).toBe("Not done");
    // Both in the row's fixed action slot, with Edit beside them and Remove
    // nowhere on the row.
    for (const name of [
      "WAP applications close",
      "Theme camp registration closes",
    ]) {
      const actions = within(row(name)).getByRole("group", {
        name: `Actions for ${name}`,
      });
      expect(
        within(actions).getByRole("button", { name: `Edit ${name}` }),
      ).toBeTruthy();
      expect(
        within(row(name)).queryByRole("button", { name: `Remove ${name}` }),
      ).toBeNull();
    }
  });

  it("marks a deadline done with the version it saw", async () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    fireEvent.click(
      screen.getByRole("button", { name: "WAP applications close done" }),
    );
    await waitFor(() =>
      expect(setDeadlineDoneAction).toHaveBeenCalledWith({
        id: "d2",
        done: true,
        expectedVersion: 1,
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps Remove in the edit dialog, behind a confirm", () => {
    render(<DeadlinesManager deadlines={DEADLINES} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit WAP applications close" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit deadline" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(
      screen.getByRole("dialog", { name: "Remove this deadline?" }),
    ).toBeTruthy();
  });

  it("says nothing about the calendar on a deadline that is on it", () => {
    render(
      <DeadlinesManager
        deadlines={[
          ...DEADLINES,
          { ...BASE, id: "d3", title: "MOOP report due", calendar: "pending" },
        ]}
      />,
    );
    expect(row("WAP applications close").textContent).not.toContain(
      "camp calendar",
    );
    expect(row("MOOP report due").textContent).toContain(
      "Not on the camp calendar yet",
    );
  });
});
