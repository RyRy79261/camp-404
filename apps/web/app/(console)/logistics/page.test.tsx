import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  setMyAttendanceAction: vi.fn(),
  askForAttendanceAction: vi.fn(),
}));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/camp-config", () => ({
  getCurrentCycle: vi.fn(async () => null),
}));
vi.mock("@/lib/logistics", () => ({
  listLogisticsPhases: vi.fn(async () => []),
  isLogisticsCalendarConnected: vi.fn(() => true),
  getAttendanceView: vi.fn(),
  isAskedForAttendance: vi.fn(async () => false),
  listDeadlines: vi.fn(async () => []),
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  getAttendanceView,
  isAskedForAttendance,
  isLogisticsCalendarConnected,
  listDeadlines,
  listLogisticsPhases,
  type AttendanceView,
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

const EMPTY = { going: [], maybe: [], cant: [] };

/** The board as the facade hands it to a viewer who may or may not see who is silent. */
function board(names: boolean): AttendanceView {
  return {
    phases: [
      {
        phase: "pack",
        names: { going: ["Dee"], maybe: ["Mo"], cant: [] },
        notAnswered: names ? ["Quiet Quinn"] : [],
      },
      { phase: "build", names: EMPTY, notAnswered: [] },
      { phase: "strike", names: EMPTY, notAnswered: [] },
      { phase: "unpack", names: EMPTY, notAnswered: [] },
    ],
    mine: { pack: "maybe" },
    namesWhoHaveNotAnswered: names,
    notAnsweredCount: { pack: 1, build: 0, strike: 0, unpack: 0 },
  };
}

describe("logistics page", () => {
  beforeEach(() => {
    vi.mocked(listLogisticsPhases).mockResolvedValue([BUILD]);
    vi.mocked(isLogisticsCalendarConnected).mockReturnValue(true);
    vi.mocked(getAttendanceView).mockImplementation(async ({ rank }) =>
      board(rank !== "camp_member"),
    );
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

  it("asks to clear again, and offers Clear days, when a cleared phase is still on the calendar", async () => {
    signIn("captain");
    vi.mocked(listLogisticsPhases).mockResolvedValue([
      {
        ...BUILD,
        startDate: null,
        endDate: null,
        place: null,
        note: null,
        version: 2,
        calendarSyncedVersion: 1,
      },
    ]);
    await show();
    const build = text(screen.getByRole("listitem", { name: "Build" }));
    expect(build).toContain(
      "Still on the camp calendar. Clear the days again to take it off.",
    );
    expect(build).not.toContain("Save again");
    fireEvent.click(button("Edit Build"));
    expect(screen.getByRole("button", { name: "Clear days" })).toBeTruthy();
  });

  it("offers no Clear days for a phase with no days and nothing on the calendar", async () => {
    signIn("captain");
    await show();
    fireEvent.click(button("Edit Pack"));
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear days" })).toBeNull();
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

  it("shows everyone's answers by name and the member's own, but not who is silent to a member", async () => {
    signIn("camp_member");
    await show();
    const pack = screen.getByRole("listitem", { name: "Who can help: Pack" });
    expect(text(pack)).toContain(
      "1 going · 1 maybe · 0 can't · 1 not answered",
    );
    expect(text(pack)).toContain("Dee");
    expect(text(pack)).not.toContain("Quiet Quinn");
    const mine = within(pack).getByRole("group", {
      name: "Your answer for Pack",
    });
    expect(
      within(mine)
        .getByRole("button", { name: "Maybe" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getAttendanceView).toHaveBeenCalledWith({
      userId: "user-1",
      rank: "camp_member",
      cycle: 2027,
    });
    // Only a captain asks everyone.
    expect(screen.queryByRole("button", { name: "Ask everyone" })).toBeNull();
  });

  it("names who has not answered to a lead", async () => {
    signIn("team_lead", ["kitchen"]);
    await show();
    const pack = screen.getByRole("listitem", { name: "Who can help: Pack" });
    expect(text(pack)).toContain("Not answered (1)Quiet Quinn");
    expect(screen.queryByRole("button", { name: "Ask everyone" })).toBeNull();
  });

  it("gives a captain Ask everyone", async () => {
    signIn("captain");
    await show();
    expect(screen.getByRole("button", { name: "Ask everyone" })).toBeTruthy();
  });

  it("closes a phase's answers once it has started", async () => {
    signIn("camp_member");
    vi.mocked(listLogisticsPhases).mockResolvedValue([
      { ...BUILD, startDate: "2020-01-01", endDate: "2020-01-02" },
    ]);
    await show();
    const build = screen.getByRole("listitem", { name: "Who can help: Build" });
    expect(text(build)).toContain("Build has started, so answers are closed.");
    expect(
      (
        within(build).getByRole("button", {
          name: "Going",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("tells an asked member, and lists the AfrikaBurn dates in their groups", async () => {
    signIn("camp_member");
    vi.mocked(isAskedForAttendance).mockResolvedValue(true);
    const row = {
      cycle: 2027,
      note: null,
      done: false,
      skipped: false,
      calendarEventId: "e1",
      calendarSyncedVersion: 1,
      version: 1,
      removedAt: null,
    };
    vi.mocked(listDeadlines).mockResolvedValue([
      {
        ...row,
        id: "d1",
        kind: "registration_closes",
        title: "Registration closes",
        dueDate: "2027-01-15",
        note: "On the AfrikaBurn site.",
        done: true,
      },
      // Set, then marked no round.
      {
        ...row,
        id: "d2",
        kind: "second_ddt_round",
        title: "Second DDT round",
        dueDate: null,
        skipped: true,
      },
      // Not announced: a standard date with no day is not shown.
      {
        ...row,
        id: "d3",
        kind: "wap_requests_open",
        title: "WAP requests open",
        dueDate: null,
      },
      {
        ...row,
        id: "d4",
        kind: null,
        title: "Mutant vehicle forms",
        dueDate: "2027-02-01",
      },
    ]);
    await show();
    expect(screen.getByTestId("attendance-asked")).toBeTruthy();
    const registration = screen.getByRole("region", {
      name: "Theme camp registration",
    });
    const closes = text(
      within(registration).getByRole("listitem", {
        name: "Registration closes",
      }),
    );
    expect(closes).toContain("Fri 15 Jan 2027 · Done");
    expect(closes).toContain("On the AfrikaBurn site.");
    expect(
      text(
        within(screen.getByRole("region", { name: "Tickets (DDT)" })).getByRole(
          "listitem",
          { name: "Second DDT round" },
        ),
      ),
    ).toContain("No round this year");
    expect(
      within(screen.getByRole("region", { name: "Other" })).getByRole(
        "listitem",
        { name: "Mutant vehicle forms" },
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Work access passes (WAP)" }),
    ).toBeNull();
    // Members read; only a captain is sent to change them.
    expect(screen.queryByRole("link", { name: "Change them" })).toBeNull();
  });
});
