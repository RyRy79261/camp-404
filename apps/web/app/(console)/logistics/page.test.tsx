import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The logistics days (#247). Every approved member reads them; only a captain
// or a Transport and Logistics lead edits. Everyone else reads the days as
// content: no Edit buttons, greyed or not, no lock line, and one quiet line
// saying who sets them (AGENTS.md, "read-only is content"). Without a camp
// calendar the page still works and says the days are only in the app.

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

import { clearLogisticsPhaseAction } from "@/app/(console)/logistics/actions";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getAttendanceView,
  isAskedForAttendance,
  isLogisticsCalendarConnected,
  listDeadlines,
  listLogisticsPhases,
  type AttendanceView,
} from "@/lib/logistics";
import { ASK_CAPTION } from "@/components/logistics/ask-attendance";
import {
  CALENDAR_NOT_CONNECTED_NOTE,
  DEADLINES_SETTINGS_HREF,
  LOGISTICS_EDITORS_NOTE,
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
    expect(build).toContain("Sat 24 Apr to Mon 26 Apr 2027");
    expect(build).toContain("3 days");
    expect(build).toContain("On site · Bring gloves.");
    expect(
      text(within(list).getByRole("listitem", { name: "Pack" })),
    ).toContain("Days not set yet.");
  });

  it("says nothing about the calendar on a day that is on it", async () => {
    signIn("captain");
    await show();
    const build = text(screen.getByRole("listitem", { name: "Build" }));
    // The page description says every day is on the camp calendar; a row
    // only speaks when it is not.
    expect(build).not.toContain("camp calendar");
  });

  it("gives a member the days as content: no Edit, no lock line, one quiet note", async () => {
    signIn("camp_member");
    await show();
    const list = screen.getByRole("list", { name: "Logistics days" });
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(screen.queryByText(LOGISTICS_REFUSAL)).toBeNull();
    expect(screen.getByText(LOGISTICS_EDITORS_NOTE)).toBeTruthy();
  });

  it("refuses a lead of another team the same way", async () => {
    signIn("team_lead", ["kitchen"]);
    await show();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(screen.getByText(LOGISTICS_EDITORS_NOTE)).toBeTruthy();
  });

  it("lets a Transport and Logistics lead edit, with Edit on every row", async () => {
    signIn("team_lead", ["transport_and_logistics"]);
    await show();
    expect(screen.queryByText(LOGISTICS_EDITORS_NOTE)).toBeNull();
    const list = screen.getByRole("list", { name: "Logistics days" });
    for (const li of within(list).getAllByRole("listitem")) {
      const edit = within(li).getByRole("button", {
        name: `Edit ${li.getAttribute("aria-label")}`,
      }) as HTMLButtonElement;
      expect(edit.disabled).toBe(false);
      expect(edit.closest("[data-slot=row-actions]")).toBeTruthy();
    }
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

  it("asks before clearing a phase's days", async () => {
    signIn("captain");
    await show();
    fireEvent.click(button("Edit Build"));
    fireEvent.click(button("Clear days"));
    const confirm = screen.getByRole("group", { name: "Clear the Build days" });
    expect(text(confirm)).toContain("Take Build off the camp calendar?");
    expect(clearLogisticsPhaseAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Keep the days" }),
    );
    expect(
      screen.queryByRole("group", { name: "Clear the Build days" }),
    ).toBeNull();
    expect(clearLogisticsPhaseAction).not.toHaveBeenCalled();
  });

  it("says the picked days back in the page's words", async () => {
    signIn("captain");
    await show();
    fireEvent.click(button("Edit Build"));
    const dialog = screen.getByRole("dialog", { name: "Build" });
    expect(text(dialog)).toContain("Sat 24 Apr 2027");
    expect(text(dialog)).toContain("Mon 26 Apr 2027");
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
    expect(build).toContain("Sat 24 Apr to Mon 26 Apr 2027");
    expect(build).not.toContain("camp calendar");
  });

  it("shows everyone's answers by name and the member's own, but not who is silent to a member", async () => {
    signIn("camp_member");
    await show();
    const pack = screen.getByRole("listitem", { name: "Who can help: Pack" });
    // The counts are said once, in each answer's label; a member gets how
    // many have not answered, never who.
    expect(text(pack)).toContain("Going (1)");
    expect(text(pack)).toContain("Maybe (1)");
    expect(text(pack)).not.toContain("going ·");
    expect(screen.getByTestId("attendance-counts-pack").textContent).toBe(
      "1 not answered.",
    );
    expect(text(pack)).toContain("Dee");
    expect(text(pack)).not.toContain("Quiet Quinn");
    expect(text(pack)).toContain("Your answer");
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
    // Only a captain asks.
    expect(
      screen.queryByRole("button", { name: "Ask who can help" }),
    ).toBeNull();
  });

  it("names who has not answered to a lead, as chips", async () => {
    signIn("team_lead", ["kitchen"]);
    await show();
    const pack = screen.getByRole("listitem", { name: "Who can help: Pack" });
    expect(text(pack)).toContain("Not answered (1)Quiet Quinn");
    expect(screen.queryByTestId("attendance-counts-pack")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Ask who can help" }),
    ).toBeNull();
  });

  it("puts Who can help first while the viewer has a day to answer, and the days first once they have answered", async () => {
    const order = () =>
      screen
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent)
        .filter((t) => t === "The days" || t === "Who can help");
    signIn("camp_member");
    await show();
    expect(order()).toEqual(["Who can help", "The days"]);
    cleanup();
    vi.mocked(getAttendanceView).mockResolvedValue({
      ...board(false),
      mine: { pack: "going", build: "maybe", strike: "cant", unpack: "going" },
    });
    await show();
    expect(order()).toEqual(["The days", "Who can help"]);
  });

  it("gives a captain Ask who can help as the main button, saying who it reaches", async () => {
    signIn("captain");
    await show();
    const ask = screen.getByRole("button", { name: "Ask who can help" });
    expect(ask.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(ask.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(ASK_CAPTION);
    expect(
      screen.getByRole("link", { name: "Open the calendar" }).className,
    ).toContain("underline-offset");
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

  it("tells an asked member at the top, in the blue tint, with a way to answer", async () => {
    signIn("camp_member");
    vi.mocked(isAskedForAttendance).mockResolvedValue(true);
    await show();
    const asked = screen.getByTestId("attendance-asked");
    expect(asked.className).toContain("bg-card");
    expect(asked.className).not.toContain("warning");
    const answer = within(asked).getByRole("link", { name: "Answer now" });
    const target = answer.getAttribute("href")?.slice(1) ?? "";
    expect(document.getElementById(target)?.textContent).toBe("Who can help");
    // At the top: before every section.
    const firstSection = screen.getAllByRole("heading", { level: 2 })[0]!;
    expect(
      asked.compareDocumentPosition(firstSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("lists the open AfrikaBurn deadlines first and folds the done ones away", async () => {
    signIn("camp_member");
    const row = {
      cycle: 2027,
      note: null,
      done: false,
      calendarEventId: "e1",
      calendarSyncedVersion: 1,
      version: 1,
      removedAt: null,
    };
    vi.mocked(listDeadlines).mockResolvedValue([
      {
        ...row,
        id: "d1",
        title: "Theme camp registration closes",
        dueDate: "2027-01-15",
        note: "On the AfrikaBurn site.",
        done: true,
      },
      {
        ...row,
        id: "d2",
        title: "WAP applications close",
        dueDate: "2027-03-01",
      },
    ]);
    await show();
    const open = screen.getByRole("list", { name: "AfrikaBurn deadlines" });
    expect(
      within(open)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["WAP applications close"]);
    expect(text(open)).toContain("Mon 1 Mar 2027");
    const done = screen.getByRole("list", {
      name: "Done AfrikaBurn deadlines",
    });
    expect(done.closest("details")?.textContent).toContain("Done (1)");
    expect(text(done)).toContain("On the AfrikaBurn site.");
    // Members read; only a captain is sent to change them.
    expect(screen.queryByRole("link", { name: /Edit deadlines/ })).toBeNull();
  });

  it("sends a captain straight to the deadlines list on the year page", async () => {
    signIn("captain");
    await show();
    expect(
      screen.getByRole("link", { name: "Edit deadlines" }).getAttribute("href"),
    ).toBe(DEADLINES_SETTINGS_HREF);
  });
});
