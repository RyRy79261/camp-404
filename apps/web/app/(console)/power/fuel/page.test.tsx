import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The fuel estimate in the approved redesign (option B): the answer first
// ("Fill 23 jerry cans: 446 L of petrol for 11 days."), then how the figure is
// reached, then the plan as a list of facts. An editor (a captain or a Power &
// Lighting lead) changes the plan behind "Change the plan" and keeps the
// generators; everyone else reads the same page with no button at all. The
// camp is the mock-up's own (tests/power-camp.ts), from the test store: 32.6
// kWh a day on the Honda EU70is, 11 days, a 20% margin, 20 L cans, 8 owned.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/actions");

import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY } from "@/lib/power-copy";
import { testStore } from "@/lib/test-store";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerFuelPage from "./page";

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
  await renderServer(PowerFuelPage());
}

/** The figure beside a line of "How we get there". */
function ledger(label: string | RegExp): string {
  const card = screen.getByRole("region", { name: "How we get there" });
  const term = within(card).getByText(label);
  return term.nextElementSibling?.textContent ?? "";
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("the fuel estimate", () => {
  it("opens on the answer: the cans to fill, the litres and the days", async () => {
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toContain(
      "Fill 23 jerry cans: 446 L of petrol for 11 days.",
    );
    expect(within(answer).getByText("We own 8 cans: buy 15 cans")).toBeTruthy();
    // The answer comes before the working and the plan, never under a form.
    const regions = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"));
    expect(regions.indexOf("The answer")).toBeLessThan(
      regions.indexOf("How we get there"),
    );
    expect(regions.indexOf("How we get there")).toBeLessThan(
      regions.indexOf("The plan"),
    );
  });

  it("says 'can', singular, for one owned and one to buy (CodeRabbit, #329)", async () => {
    const version = testStore.getPowerPlan().version;
    testStore.setPowerPlan({
      actorId: camp.pat.id,
      expectedVersion: version,
      patch: { cansOwned: 1 },
    });
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(within(answer).getByText(/^We own 1 can:/)).toBeTruthy();
    expect(within(answer).queryByText(/^We own 1 cans:/)).toBeNull();

    // cansOwned 0 and a can big enough that only one is needed: "Buy 1
    // can", not "Buy 1 cans".
    testStore.setPowerPlan({
      actorId: camp.pat.id,
      expectedVersion: version + 1,
      patch: { cansOwned: 0, canLitres: 1000 },
    });
    cleanup();
    await renderAs("mem", "camp_member");
    const answer2 = screen.getByRole("region", { name: "The answer" });
    expect(within(answer2).getByText("Buy 1 can")).toBeTruthy();
    expect(within(answer2).queryByText("Buy 1 cans")).toBeNull();
  });

  it("shows how the figure is reached, line by line", async () => {
    await renderAs("mem", "camp_member");
    expect(ledger(/^Fuel a day for 32\.6 kWh on the Honda$/)).toBe("33.8 L");
    expect(ledger("× 11 days on site")).toBe("371.8 L");
    expect(ledger("+ 20% safety margin")).toBe("74.4 L");
    expect(ledger("Litres for the burn")).toBe("446.2 L");
    expect(ledger("÷ 20 L a can, rounded up")).toBe("23 cans");
    expect(ledger("− cans we already own")).toBe("8");
    expect(ledger("Cans to buy")).toBe("15");
  });

  it("reads the plan as facts, the spare generator in plain words", async () => {
    await renderAs("mem", "camp_member");
    const plan = screen.getByRole("region", { name: "The plan" });
    const fact = (label: string) =>
      within(plan).getByText(label).nextElementSibling?.textContent;
    expect(fact("Generator")).toBe("Honda EU70is · 5.5 kVA");
    expect(fact("Runs")).toBe("All day and night · 24 h");
    expect(fact("Days on site")).toBe("11");
    expect(fact("Spare generator")).toBe(
      "Kipor 10, hired. Only if the Honda fails. Not in the sums.",
    );
    // No form field anywhere: a reader gets facts, not a disabled form.
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });

  it("marks the generator in the plan", async () => {
    await renderAs("mem", "camp_member");
    const list = screen.getByRole("list", { name: "Generators" });
    const honda = within(list).getByRole("listitem", { name: "Honda EU70is" });
    expect(within(honda).getByText("In the plan")).toBeTruthy();
    const kipor = within(list).getByRole("listitem", { name: "Kipor 10" });
    expect(within(kipor).queryByText("In the plan")).toBeNull();
    expect(kipor.textContent).toContain("Hired");
  });

  it("gives a member and a Kitchen lead no button at all", async () => {
    await renderAs("mem", "camp_member");
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    cleanup();
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a Power & Lighting lead the plan and the generators to change", async () => {
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(screen.queryByText(POWER_READ_ONLY)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Change the plan" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add a generator" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit Honda EU70is" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Kipor 10" })).toBeTruthy();
  });

  it("says what is missing before there is an estimate", async () => {
    camp = setUpPowerCamp({ empty: true });
    await renderAs("cap", "captain");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(within(answer).getByText("No estimate yet.")).toBeTruthy();
    expect(answer.textContent).toContain(
      "Add the generator below and choose it in the plan",
    );
    expect(
      within(screen.getByRole("region", { name: "The plan" })).getByText(
        "None chosen yet",
      ),
    ).toBeTruthy();
  });
});
