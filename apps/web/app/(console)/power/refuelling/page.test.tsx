import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Refuelling: the fuel can register the owner approved (option A,
// 2026-10-02). One table in the printed sheet's order, the car totals above
// it, and "Filled by" derived from each can's car, never picked. The camp is
// the mock-up's own (tests/power-camp.ts): ten cans, 205 L, three on Dana's
// car, two each on Sipho's and Lee-Anne's, one on Mike's, two on no car.
// Only a captain or a Power & Lighting lead gets Add a can and Edit.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/refuelling/actions");

import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY, PRINT_CAN_SHEET_PATH } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerRefuellingPage from "./page";

let camp: PowerCamp;

async function renderAs(
  who: keyof PowerCamp,
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: camp[who].id },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads as never);
  await renderServer(PowerRefuellingPage());
}

const table = () => screen.getByRole("table", { name: "Fuel cans" });
const row = (n: number) =>
  within(table()).getByRole("row", { name: `Can ${n}` });
const cells = (n: number) =>
  within(row(n))
    .getAllByRole("cell")
    .map((c) => c.textContent);

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("refuelling: the fuel can register", () => {
  it("answers in the rail with the cans, their litres and those on no car", async () => {
    await renderAs("mem", "camp_member");
    const rail = screen.getByRole("navigation", { name: "Power" });
    const link = within(rail).getByRole("link", { name: /Refuelling/ });
    expect(link.getAttribute("href")).toBe("/power/refuelling");
    expect(link.textContent).toContain("10 cans, 205 L");
    expect(link.textContent).toContain("2 cans not on a car yet");
  });

  it("lists every can in the sheet's order, with who fills it from its car", async () => {
    await renderAs("mem", "camp_member");
    expect(within(table()).getAllByRole("row")).toHaveLength(11);
    expect(cells(1)).toEqual([
      "1",
      "Camp",
      "25 L",
      "Metal",
      "Dana's Toyota",
      "Dana van der Merwe",
      "Red, camp stencil",
    ]);
    expect(cells(5)).toEqual([
      "5",
      "Pat Mokoena",
      "20 L",
      "Metal",
      "Sipho's Land Rover",
      "Sipho Ndlovu",
      "Green, dented lid",
    ]);
    // Mike gave no make: his car is "Mike's car", and he still fills it.
    expect(cells(7)).toContain("Mike's car");
    expect(cells(7)).toContain("Mike Fourie");
    // On no car: nobody fills it yet.
    expect(cells(9)).toEqual([
      "9",
      "Pat Mokoena",
      "25 L",
      "Metal",
      "Not on a car yet",
      "Nobody yet",
      "",
    ]);
  });

  it("totals each car's cans above the list, and the cans on no car", async () => {
    await renderAs("mem", "camp_member");
    const totals = screen.getByRole("list", { name: "Cans per car" });
    const text = (name: string) =>
      within(totals).getByRole("listitem", { name }).textContent;
    expect(text("Dana's Toyota")).toBe(
      "Dana's Toyota3 cans · 70 LDana fills them",
    );
    expect(text("Sipho's Land Rover")).toContain("2 cans · 45 L");
    expect(text("Lee-Anne's VW")).toContain("2 cans · 30 L");
    expect(text("Mike's car")).toBe("Mike's car1 can · 20 LMike fills it");
    expect(text("Not on a car yet")).toContain("2 cans · 40 L");
    expect(text("Not on a car yet")).toContain("Nobody fills these yet");
  });

  it("follows a driver who stops driving: their cans are on no car", async () => {
    const { testStore } = await import("@/lib/test-store");
    testStore.seedDriverProfile({
      userId: camp.lee.id,
      intendsToDrive: false,
    });
    await renderAs("mem", "camp_member");
    expect(cells(6)).toContain("Not on a car yet");
    expect(cells(6)).toContain("Nobody yet");
    const totals = screen.getByRole("list", { name: "Cans per car" });
    expect(
      within(totals).getByRole("listitem", { name: "Not on a car yet" })
        .textContent,
    ).toContain("4 cans · 70 L");
  });

  it("gives every member the can sheet, and a reader nothing to press", async () => {
    await renderAs("mem", "camp_member");
    expect(
      screen
        .getByRole("link", { name: "Print the can sheet" })
        .getAttribute("href"),
    ).toBe(PRINT_CAN_SHEET_PATH);
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.getByText(/Ask Pat Mokoena\./)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      within(table()).queryByRole("columnheader", { name: "Action" }),
    ).toBeNull();
  });

  it("gives a Kitchen lead the same read", async () => {
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a Power & Lighting lead Add a can and one Edit per can", async () => {
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(screen.queryByText(POWER_READ_ONLY)).toBeNull();
    expect(screen.getByRole("button", { name: "Add a can" })).toBeTruthy();
    expect(
      within(row(4)).getByRole("button", { name: "Edit can 4" }),
    ).toBeTruthy();
    // One Edit per can on the table and one on each phone card.
    expect(screen.getAllByRole("button", { name: /^Edit can / })).toHaveLength(
      20,
    );
  });
});
