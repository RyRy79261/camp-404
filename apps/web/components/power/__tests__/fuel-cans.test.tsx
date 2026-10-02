import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// The fuel can register's list and dialog (#255; option A, 2026-10-02).
// What matters: "Filled by" is never a pick, it follows the car chosen; an
// edit sends the version it saw (compare-and-set) and never a filler; a
// refusal from the server shows in the dialog; Remove sends the version too;
// and a reader gets the list with nothing to press.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/power/refuelling/actions", () => ({
  addFuelCanAction: vi.fn(async () => ({ ok: true, data: { number: 3 } })),
  updateFuelCanAction: vi.fn(async () => ({ ok: true })),
  removeFuelCanAction: vi.fn(async () => ({ ok: true })),
}));

import {
  addFuelCanAction,
  removeFuelCanAction,
  updateFuelCanAction,
} from "@/app/(console)/power/refuelling/actions";
import {
  choose,
  installSelectPolyfills,
  optionNames,
} from "@/components/questionnaires/__tests__/select-helpers";
import { FuelCanList, type CanView, type CarView } from "../fuel-cans";

const DANA = "11111111-1111-4111-8111-111111111111";
const SIPHO = "22222222-2222-4222-8222-222222222222";
const PAT = "33333333-3333-4333-8333-333333333333";
const CAN_ID = "44444444-4444-4444-8444-444444444444";

const cars: CarView[] = [
  {
    driverUserId: DANA,
    label: "Dana's Toyota",
    driverName: "Dana van der Merwe",
    firstName: "Dana",
    cans: 1,
    litres: 25,
  },
  {
    driverUserId: SIPHO,
    label: "Sipho's Land Rover",
    driverName: "Sipho Ndlovu",
    firstName: "Sipho",
    cans: 0,
    litres: 0,
  },
];

const cans: CanView[] = [
  {
    id: CAN_ID,
    version: 4,
    number: 1,
    ownerUserId: PAT,
    ownerName: "Pat Mokoena",
    sizeLitres: 25,
    material: "metal",
    travelsWithUserId: DANA,
    carLabel: "Dana's Toyota",
    filledBy: "Dana van der Merwe",
    note: "Red, camp stencil",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    version: 1,
    number: 2,
    ownerUserId: null,
    ownerName: "Camp",
    sizeLitres: 15,
    material: null,
    travelsWithUserId: null,
    carLabel: null,
    filledBy: null,
    note: null,
  },
];

function renderList(canEdit = true) {
  render(
    <FuelCanList
      cans={cans}
      cars={cars}
      notOnCar={{ cans: 1, litres: 15 }}
      canEdit={canEdit}
      members={[{ id: PAT, name: "Pat Mokoena" }]}
    />,
  );
}

const dialog = () => screen.getByRole("dialog");
const filledBy = () =>
  within(dialog()).getByRole("definition").textContent ?? "";

beforeAll(installSelectPolyfills);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("the fuel can dialog", () => {
  it("shows who fills the can from its car, and follows the car chosen", async () => {
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit can 1" })[0]!);
    expect(
      within(dialog()).getByRole("heading", { name: "Can 1" }),
    ).toBeTruthy();
    expect(filledBy()).toContain("Dana van der Merwe, the driver");

    const car = within(dialog()).getByRole("combobox", {
      name: "Travels with",
    });
    expect(await optionNames(car)).toEqual([
      "Dana's Toyota · Dana van der Merwe",
      "Sipho's Land Rover · Sipho Ndlovu",
      "Not on a car yet",
    ]);
    await choose(car, "Sipho's Land Rover · Sipho Ndlovu");
    expect(filledBy()).toContain("Sipho Ndlovu, the driver");
    await choose(car, "Not on a car yet");
    expect(filledBy()).toBe("Nobody yet: choose a car above.");
    // There is no field to pick who fills it.
    expect(
      within(dialog()).queryByRole("combobox", { name: /Filled/ }),
    ).toBeNull();
  });

  it("saves from the version seen, with the car and never a filler", async () => {
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit can 1" })[0]!);
    await choose(
      within(dialog()).getByRole("combobox", { name: "Travels with" }),
      "Sipho's Land Rover · Sipho Ndlovu",
    );
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Save the can" }),
    );
    await waitFor(() => expect(updateFuelCanAction).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(updateFuelCanAction).mock.calls[0]![0];
    expect(sent).toEqual({
      canId: CAN_ID,
      expectedVersion: 4,
      ownerUserId: PAT,
      sizeLitres: 25,
      material: "metal",
      travelsWithUserId: SIPHO,
      note: "Red, camp stencil",
    });
  });

  it("shows the server's refusal in the dialog, and keeps it open", async () => {
    vi.mocked(updateFuelCanAction).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed this can first. Reload the page.",
    });
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit can 1" })[0]!);
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Save the can" }),
    );
    expect((await within(dialog()).findByRole("alert")).textContent).toBe(
      "Someone changed this can first. Reload the page.",
    );
  });

  it("asks for a material on a can listed before it was asked", async () => {
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit can 2" })[0]!);
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Save the can" }),
    );
    expect(
      await within(dialog()).findByText("Choose what it is made of."),
    ).toBeTruthy();
    expect(updateFuelCanAction).not.toHaveBeenCalled();
  });

  it("adds a can as the camp's, on no car, numbered after the last", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Add a can" }));
    expect(within(dialog()).getByText(/as can 3\./)).toBeTruthy();
    expect(filledBy()).toBe("Nobody yet: choose a car above.");
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Add the can" }),
    );
    await waitFor(() => expect(addFuelCanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(addFuelCanAction).mock.calls[0]![0]).toEqual({
      ownerUserId: null,
      sizeLitres: 20,
      material: "plastic",
      travelsWithUserId: null,
      note: "",
    });
  });

  it("removes a can from the version seen", async () => {
    renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit can 1" })[0]!);
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Remove the can" }),
    );
    await waitFor(() =>
      expect(removeFuelCanAction).toHaveBeenCalledWith({
        canId: CAN_ID,
        expectedVersion: 4,
      }),
    );
  });
});

describe("the list for a reader", () => {
  it("shows every can and the car totals, with nothing to press", () => {
    renderList(false);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const table = screen.getByRole("table", { name: "Fuel cans" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    const totals = screen.getByRole("list", { name: "Cans per car" });
    expect(
      within(totals).getByRole("listitem", { name: "Sipho's Land Rover" })
        .textContent,
    ).toContain("Nothing to fill");
    expect(
      within(totals).getByRole("listitem", { name: "Not on a car yet" })
        .textContent,
    ).toContain("1 can · 15 L");
  });
});
