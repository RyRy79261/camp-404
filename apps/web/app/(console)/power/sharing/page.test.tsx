import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sharing a generator with a neighbouring camp, its own section in the
// approved redesign (option B; the audit found it hidden under Readiness).
// It opens on one sentence: who shares whose generator and how much fuel,
// and whether the split is agreed. Until it is, the shares read "Not agreed
// yet", never a 100% / 0% split that looks like an answer, and there is no
// paper summary to print. The litres are the fuel estimate's own, from the
// plan's generator. The camp is the mock-up's own (tests/power-camp.ts).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/readiness/actions");

import { SharingAgreementInput } from "@camp404/types";
import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY, PRINT_SHARING_PATH } from "@/lib/power-copy";
import { testStore } from "@/lib/test-store";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerSharingPage from "./page";

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
  await renderServer(PowerSharingPage());
}

/** Moonbeam takes a typed 25% of the fuel. */
function agreeQuarter() {
  const current = testStore.getSharingAgreement()!;
  const saved = testStore.saveSharingAgreement({
    ...SharingAgreementInput.parse({
      partnerCamp: current.partnerCamp,
      contactRole: current.contactRole,
      generatorSource: "ours",
      generatorId: current.generatorId,
      partnerFuelPct: 25,
      watchCover: current.watchCover,
      expectedVersion: current.version,
    }),
    actorId: camp.pat.id,
  });
  if (!saved.ok) throw new Error(saved.error);
}

const agreement = () => screen.getByRole("table", { name: "The agreement" });

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("sharing", () => {
  it("says who shares what, with the fuel estimate's litres, and that the split is open", async () => {
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toBe(
      "Camp Moonbeam shares our Honda EU70is and its 446 L of petrol. The split isn't agreed yet.",
    );
    const share = within(agreement()).getByRole("row", { name: /Fuel share/ });
    expect(within(share).getAllByText("Not agreed yet")).toHaveLength(2);
    expect(share.textContent).not.toMatch(/100%|0%/);
    expect(
      screen.queryByRole("link", { name: "Print the summary" }),
    ).toBeNull();
  });

  it("gives a member and a Kitchen lead the agreement to read and no button", async () => {
    await renderAs("mem", "camp_member");
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // The how-to is for the people who can do it.
    expect(screen.queryByText(/To split the fuel/)).toBeNull();
    cleanup();
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("tells a Power & Lighting lead how to split it, and lets them change it", async () => {
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(
      screen.getByRole("button", { name: "Change the agreement" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/To split the fuel, add Camp Moonbeam's loads/),
    ).toBeTruthy();
  });

  it("reads the agreed split and offers the paper summary once there is one", async () => {
    agreeQuarter();
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toContain("They take 25% of the fuel: 112 L.");
    const share = within(agreement()).getByRole("row", { name: /Fuel share/ });
    expect(share.textContent).toContain("75% · 335 L");
    expect(share.textContent).toContain("25% · 112 L");
    expect(
      screen
        .getByRole("link", { name: "Print the summary" })
        .getAttribute("href"),
    ).toBe(PRINT_SHARING_PATH);
  });

  it("says so plainly when the camp shares nothing", async () => {
    camp = setUpPowerCamp({ empty: true });
    await renderAs("cap", "captain");
    expect(screen.getByText("No sharing this year.")).toBeTruthy();
  });
});
