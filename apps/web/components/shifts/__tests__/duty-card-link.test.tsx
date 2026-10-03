import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ShiftDayView, ShiftTypeView } from "@/lib/shifts";
import {
  choose,
  installSelectPolyfills,
  optionNames,
} from "@/components/questionnaires/__tests__/select-helpers";

// Each shift links to its duty card (#250; the owner's Option A,
// 2026-10-02): the row says "Duty card" under the shift's name (table and
// phone cards alike), and the set-up dialog picks the card from the Survival
// Guide's duty cards: the shift's own team's first, then the other teams',
// then None, each saying which other shifts it already serves.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/(console)/shifts/actions", () => ({
  saveShiftTypeAction: vi.fn(async () => ({
    ok: true,
    data: { daysAdded: 0 },
  })),
  removeShiftTypeAction: vi.fn(),
  fillShiftDaysAction: vi.fn(),
  setSlotNeededAction: vi.fn(),
  signUpForShiftAction: vi.fn(),
  leaveShiftAction: vi.fn(),
  placeMemberOnShiftAction: vi.fn(),
  takeMemberOffShiftAction: vi.fn(),
}));

import { saveShiftTypeAction } from "@/app/(console)/shifts/actions";
import { ShiftDay } from "../shift-day";
import { ShiftTypeDialog } from "../shift-type-dialog";

beforeAll(installSelectPolyfills);
afterEach(() => {
  cleanup();
  vi.mocked(saveShiftTypeAction).mockClear();
});

const DISHES = "11111111-1111-4111-8111-111111111111";
const COOKS = "22222222-2222-4222-8222-222222222222";
const TOILETS = "33333333-3333-4333-8333-333333333333";
const BREAKFAST = "44444444-4444-4444-8444-444444444444";

function type(over: Partial<ShiftTypeView>): ShiftTypeView {
  return {
    id: BREAKFAST,
    team: "kitchen",
    teamLabel: "Kitchen",
    name: "Breakfast dishes",
    startMinute: 9 * 60,
    durationMinutes: 60,
    places: 3,
    note: null,
    version: 2,
    timeText: "09:00–10:00",
    dutyCardId: null,
    dutyCard: null,
    canManage: false,
    missingDays: 0,
    hasPeople: false,
    ...over,
  };
}

function day(types: ShiftTypeView[]): ShiftDayView {
  return {
    day: "2027-04-28",
    label: "Wed 28 Apr",
    tab: "Wed 28",
    longLabel: "Wednesday 28 April",
    outsideBurn: false,
    openPlaces: 3,
    slots: types.map((t, i) => ({
      id: `slot-${i}`,
      typeId: t.id,
      day: "2027-04-28",
      status: "open" as const,
      version: 1,
      taken: 0,
      names: [],
      others: [],
      people: null,
      mine: false,
      open: true,
      type: t,
    })),
  };
}

describe("the shift row's Duty card link", () => {
  it("shows under a shift with a card, opening it in the Survival Guide, and nowhere else", () => {
    render(
      <ShiftDay
        day={day([
          type({
            dutyCardId: DISHES,
            dutyCard: { id: DISHES, title: "Dishes", href: "/guide/dishes" },
          }),
          type({ id: "other", name: "Lounge host", team: "ministry_of_vibes" }),
        ])}
        members={null}
        arrows={false}
      />,
    );
    // The table and the phone cards each draw it once.
    const links = screen.getAllByRole("link", {
      name: "Duty card for Breakfast dishes: Dishes",
    });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/guide/dishes");
      expect(link.textContent).toBe("Duty card");
    }
    expect(screen.queryByRole("link", { name: /Lounge host/ })).toBeNull();
  });
});

describe("the set-up dialog's duty card picker", () => {
  const cards = [
    { id: COOKS, title: "Breakfast cooks", team: "kitchen" },
    { id: DISHES, title: "Dishes", team: "kitchen" },
    { id: TOILETS, title: "Toilets and showers", team: "sanitation_and_water" },
  ];
  const shiftTypes = [
    { id: BREAKFAST, name: "Breakfast dishes", dutyCardId: DISHES },
    { id: "dinner", name: "Dinner dishes", dutyCardId: DISHES },
  ];

  function openChange() {
    render(
      <ShiftTypeDialog
        type={{
          id: BREAKFAST,
          team: "kitchen",
          name: "Breakfast dishes",
          startMinute: 9 * 60,
          durationMinutes: 60,
          places: 3,
          note: null,
          dutyCardId: DISHES,
          version: 2,
        }}
        teams={[{ key: "kitchen", label: "Kitchen" }]}
        dutyCards={cards}
        shiftTypes={shiftTypes}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Change Breakfast dishes" }),
    );
    return screen.getByRole("combobox", { name: /Duty card/ });
  }

  it("shows the shift's card, offers this team's cards, then the others', then None", async () => {
    const picker = openChange();
    expect(picker.textContent).toBe("Dishes");
    expect(await optionNames(picker)).toEqual([
      "Breakfast cooks",
      // This shift is not named: only the others the card is on.
      "Dishesalso on Dinner dishes",
      "Toilets and showers",
      "None",
    ]);
  });

  it("groups them under the shift's team and Other teams", async () => {
    const picker = openChange();
    fireEvent.click(picker);
    const listbox = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[role="listbox"]');
      if (!el) throw new Error("not open");
      return el;
    });
    const groups = within(listbox).getAllByRole("group");
    expect(groups.map((g) => g.firstElementChild?.textContent)).toEqual([
      "Kitchen",
      "Other teams",
    ]);
  });

  it("saves the card picked, and null for None", async () => {
    let picker = openChange();
    await choose(picker, /^Toilets/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveShiftTypeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveShiftTypeAction).mock.calls[0]![0]).toMatchObject({
      id: BREAKFAST,
      dutyCardId: TOILETS,
      expectedVersion: 2,
    });
    cleanup();

    picker = openChange();
    await choose(picker, "None");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveShiftTypeAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveShiftTypeAction).mock.calls[1]![0]).toMatchObject({
      dutyCardId: null,
    });
  });

  it("leaves a new shift's card to last year's, unless one is picked", async () => {
    render(
      <ShiftTypeDialog
        teams={[{ key: "kitchen", label: "Kitchen" }]}
        dutyCards={cards}
        shiftTypes={shiftTypes}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a shift" }));
    expect(
      screen.getByText(
        "Left unpicked, it takes the card last year's shift of the same name had.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dinner dishes" },
    });
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "21:00" },
    });
    fireEvent.change(screen.getByLabelText("People"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveShiftTypeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveShiftTypeAction).mock.calls[0]![0]).not.toHaveProperty(
      "dutyCardId",
    );
  });
});
