import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The meal plan's unsaved numbers (the four editors' rule, design doc
// section 5), as far as a Kitchen page goes in PR C: they ask before the
// window goes, and nothing is kept or restored, so nothing inside the page
// changes (plan section 0). Nothing else about the page is tested here.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./actions", () => ({
  saveMealPlanAction: vi.fn(async () => ({ ok: true })),
}));

import { draftStorageKey } from "@/components/os/window-storage";
import { DRAFT_OWNER, DraftWindow } from "@/tests/draft-window";
import { saveMealPlanAction } from "./actions";
import { MealPlanEditor } from "./meal-plan-editor";

const KEY = draftStorageKey(DRAFT_OWNER, "meal-plan", "meal-plan");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

function editor(version = 3) {
  render(
    <DraftWindow windowKey="meal-plan">
      <MealPlanEditor
        daysOnSite={2}
        firstDay={null}
        days={[
          { breakfast: 10, dinner: 10 },
          { breakfast: 10, dinner: 10 },
        ]}
        version={version}
      />
    </DraftWindow>,
  );
}

const breakfast = () =>
  screen.getByRole("spinbutton", {
    name: "Day 1 breakfast",
  }) as HTMLInputElement;

/** A tab close or reload: cancelled when something is unsaved. */
function unloadIsAsked(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("MealPlanEditor's unsaved numbers", () => {
  it("ask before the window goes", () => {
    editor();
    expect(unloadIsAsked()).toBe(false);
    fireEvent.change(breakfast(), { target: { value: "42" } });
    expect(unloadIsAsked()).toBe(true);
  });

  it("are neither kept nor restored: the page looks as it did", () => {
    editor();
    fireEvent.change(breakfast(), { target: { value: "42" } });
    cleanup();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    editor();
    expect(breakfast().value).toBe("10");
    expect(screen.queryByText("Unsaved changes restored.")).toBeNull();
  });

  it("stop asking once saved", async () => {
    editor();
    fireEvent.change(breakfast(), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveMealPlanAction).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(unloadIsAsked()).toBe(false);
  });
});

// The camp's dates come from Logistics (the owner, 2026-10-03): a plain line
// and a link there, never a box to type in.
describe("MealPlanEditor's dates", () => {
  function dated(firstDay: string | null, daysOnSite: number) {
    render(
      <DraftWindow windowKey="meal-plan">
        <MealPlanEditor
          daysOnSite={daysOnSite}
          firstDay={firstDay}
          days={Array.from({ length: daysOnSite }, () => ({
            breakfast: 10,
            dinner: 10,
          }))}
          version={3}
        />
      </DraftWindow>,
    );
  }

  const link = () =>
    screen.getByRole("link", { name: "Change the dates in Logistics" });

  it("say Day 1 and the days on site from Logistics, with a link there, and no date or count box", () => {
    dated("2027-04-22", 11);
    expect(
      screen.getByText("Day 1: Thu 22 Apr · 11 days on site, from Logistics"),
    ).toBeTruthy();
    expect(link().getAttribute("href")).toBe("/logistics");
    expect(screen.queryByLabelText("Day 1 date")).toBeNull();
    expect(screen.queryByLabelText("Days on site")).toBeNull();
    // Each day is named with its date from Day 1.
    expect(
      screen.getByRole("rowheader", { name: "Day 3 · Sat 24 Apr" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy Day 1’s plates to every day" }),
    ).toBeTruthy();
  });

  it("say one day in the singular", () => {
    dated("2027-04-22", 1);
    expect(
      screen.getByText("Day 1: Thu 22 Apr · 1 day on site, from Logistics"),
    ).toBeTruthy();
  });

  it("ask for the dates in Logistics when there are none, and the plan still runs by day number", async () => {
    dated(null, 11);
    expect(
      screen.getByText("Set the camp’s dates in Logistics first"),
    ).toBeTruthy();
    expect(link().getAttribute("href")).toBe("/logistics");
    expect(screen.getByRole("rowheader", { name: "Day 11" })).toBeTruthy();
    fireEvent.change(breakfast(), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveMealPlanAction).toHaveBeenCalledWith({
        days: [
          { breakfast: 42, dinner: 10 },
          ...Array.from({ length: 10 }, () => ({ breakfast: 10, dinner: 10 })),
        ],
        expectedVersion: 3,
      }),
    );
  });
});
