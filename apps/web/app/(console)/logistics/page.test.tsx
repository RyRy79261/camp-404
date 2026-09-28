import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The logistics days (#247). Every approved member reads them; only a captain
// or a Transport and Logistics lead edits. Everyone else sees the Edit
// buttons PRESENT BUT DISABLED, described by the one refusal line. Without a
// camp calendar the page still works and says the days are only in the app.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/logistics/actions", () => ({
  saveLogisticsPhaseAction: vi.fn(),
  clearLogisticsPhaseAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/camp-config", () => ({
  getCurrentCycle: vi.fn(async () => null),
}));
vi.mock("@/lib/logistics", () => ({
  listLogisticsPhases: vi.fn(async () => []),
  isLogisticsCalendarConnected: vi.fn(() => true),
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  isLogisticsCalendarConnected,
  listLogisticsPhases,
} from "@/lib/logistics";
import {
  CALENDAR_NOT_CONNECTED_NOTE,
  LOGISTICS_REFUSAL,
} from "@/lib/logistics-copy";
import { getLeadTeams } from "@/lib/users";
import LogisticsPage from "./page";

function signIn(
  rank: "camp_member" | "team_lead" | "captain",
  led: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "user-1" },
    rank,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(led as never);
}

const BUILD = {
  cycle: 2027,
  phase: "build" as const,
  startDate: "2027-04-24",
  endDate: "2027-04-26",
  place: "On site",
  note: "Bring gloves.",
  calendarEventId: "claimed0001",
  calendarSyncedVersion: 1,
  version: 1,
  updatedAt: new Date(),
};

async function show() {
  render(await LogisticsPage());
}

describe("logistics page", () => {
  beforeEach(() => {
    vi.mocked(listLogisticsPhases).mockResolvedValue([BUILD]);
    vi.mocked(isLogisticsCalendarConnected).mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const text = (el: HTMLElement) => el.textContent ?? "";
  const button = (name: string) =>
    screen.getByRole("button", { name }) as HTMLButtonElement;

  it("shows every phase in order, with the days that are set", async () => {
    signIn("camp_member");
    await show();
    const list = screen.getByRole("list", { name: "Logistics days" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["Pack", "Travel", "Build", "Burn", "Strike", "Unpack"]);
    const build = text(within(list).getByRole("listitem", { name: "Build" }));
    expect(build).toContain("Sat 24 Apr to Mon 26 Apr 2027, 3 days");
    expect(build).toContain("On site");
    expect(build).toContain("Bring gloves.");
    expect(build).toContain("On the camp calendar");
    expect(
      text(within(list).getByRole("listitem", { name: "Pack" })),
    ).toContain("Days not set yet.");
  });

  it("gives a member the Edit buttons disabled, pointing at the refusal", async () => {
    signIn("camp_member");
    await show();
    expect(screen.getByText(LOGISTICS_REFUSAL)).toBeTruthy();
    const edit = button("Edit Build — not available to you");
    expect(edit.disabled).toBe(true);
    expect(edit.getAttribute("aria-describedby")).toBe(
      "logistics-edit-refusal",
    );
  });

  it("refuses a lead of another team the same way", async () => {
    signIn("team_lead", ["kitchen"]);
    await show();
    expect(screen.getByText(LOGISTICS_REFUSAL)).toBeTruthy();
    expect(button("Edit Pack — not available to you").disabled).toBe(true);
  });

  it("lets a Transport and Logistics lead edit", async () => {
    signIn("team_lead", ["transport_and_logistics"]);
    await show();
    expect(screen.queryByText(LOGISTICS_REFUSAL)).toBeNull();
    expect(button("Edit Build").disabled).toBe(false);
  });

  it("says when a phase is not on the camp calendar yet", async () => {
    signIn("captain");
    vi.mocked(listLogisticsPhases).mockResolvedValue([
      { ...BUILD, version: 2, calendarSyncedVersion: 1 },
    ]);
    await show();
    expect(text(screen.getByRole("listitem", { name: "Build" }))).toContain(
      "Not on the camp calendar yet",
    );
  });

  it("works without a camp calendar, and says the days are only in the app", async () => {
    signIn("captain");
    vi.mocked(isLogisticsCalendarConnected).mockReturnValue(false);
    await show();
    expect(screen.getByText(CALENDAR_NOT_CONNECTED_NOTE)).toBeTruthy();
    const build = text(screen.getByRole("listitem", { name: "Build" }));
    expect(build).toContain("Sat 24 Apr to Mon 26 Apr 2027, 3 days");
    expect(build).not.toContain("camp calendar");
  });
});
