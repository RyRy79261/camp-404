import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";

// The desktop's chrome: the account chip, the Start menu, the tray (inbox,
// pins, system health, countdown, clock) and the pinned strip, driven with a
// stand-in router as in desktop-shell.test.tsx. Ranks and team keys come from
// the enums the code uses (AGENTS.md, "Verification").

const nav = vi.hoisted(() => ({
  pathname: "/tasks",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
const save = vi.hoisted(() =>
  vi.fn(async (_layout: unknown) => ({ ok: true })),
);
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: nav.refresh,
    prefetch: vi.fn(),
  }),
}));
vi.mock("@/app/(console)/desktop-layout-actions", () => ({
  saveDesktopLayoutAction: save,
}));
vi.mock("@/app/(console)/notifications/actions", () => ({
  fetchNotificationPanelAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("@/components/push/device-token", () => ({
  forgetDeviceToken: vi.fn(),
}));

import { Desktop, type DesktopProps } from "../desktop-shell";
import { accountChipName, leadsLine } from "../account-chip";
import { APPLICATION_SUBMITTED, HEALTH_SENTENCE } from "../desktop-tray";
import { TerminalProgram } from "../terminal-program";
import { terminalContext } from "@/lib/terminal-commands";

const KITCHEN = Team.enum.kitchen;

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: ViewerRank.enum.camp_member,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

function props(
  over: Partial<DesktopProps> = {},
  manifestFacts: Partial<ProgramFacts> = {},
): DesktopProps {
  const mode = over.mode ?? "full";
  return {
    mode,
    manifest: buildProgramManifest(
      facts({ mode, approved: mode !== "restricted", ...manifestFacts }),
    ),
    layout: { cells: {}, items: [] },
    userId: "u-1",
    account: { name: "Ada", rank: "Member", leads: [] },
    children: <h1>The page</h1>,
    ...over,
  };
}

const openStart = () =>
  fireEvent.click(screen.getByRole("button", { name: "Start" }));

beforeEach(() => {
  nav.pathname = "/tasks";
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the account chip", () => {
  it("names one led team, counts several, and says nothing for none", () => {
    expect(leadsLine(["Kitchen"])).toBe("Leads Kitchen");
    expect(leadsLine(["Kitchen", "Power", "Finance"])).toBe("Leads 3 teams");
    expect(leadsLine([])).toBeNull();
  });

  it("carries the full list in its name and in a tooltip", () => {
    const leads = ["Kitchen", "Power & Lighting", "Finance"];
    render(
      <Desktop
        {...props({ account: { name: "Jo", rank: "Team Lead", leads } })}
      />,
    );
    const chip = screen.getByRole("button", {
      name: accountChipName("Jo", "Team Lead", leads),
    });
    expect(chip.getAttribute("aria-label")).toContain(
      "Leads Kitchen, Power & Lighting, Finance",
    );
    expect(chip.textContent).toContain("Leads 3 teams");
    const tip = chip.querySelector("[data-os-tooltip]");
    expect(tip?.textContent).toBe("Leads Kitchen, Power & Lighting, Finance");
  });

  it("has no lead line for a member, and opens My account", () => {
    render(<Desktop {...props()} />);
    const chip = screen.getByRole("button", { name: /^Ada, Member\./ });
    expect(chip.textContent).not.toContain("Leads");
    fireEvent.click(chip);
    expect(nav.push).toHaveBeenCalledWith("/profile");
  });
});

describe("the Start menu", () => {
  it("lists the groups, then Account, Report a problem, Line up icons, Show desktop and Log off", () => {
    render(
      <Desktop
        {...props(
          {
            account: { name: "Jo", rank: "Team Lead", leads: ["Kitchen"] },
          },
          {
            rank: ViewerRank.enum.team_lead,
            memberships: [{ team: KITCHEN, isLead: true }],
          },
        )}
      />,
    );
    openStart();
    const menu = within(screen.getByRole("navigation", { name: "Console" }));
    for (const group of ["Me", "Camp", "Captains", "My teams"]) {
      expect(menu.getByRole("group", { name: group })).toBeTruthy();
    }
    const rows = menu.getAllByRole("menuitem").map((el) => el.textContent);
    expect(rows.slice(-5)).toEqual([
      "Account",
      "Report a problem",
      "Line up icons",
      "Show desktop",
      "Log off",
    ]);
    expect(rows).toContain("Terminal");
    // Log off is the sign-out link, never a plain button.
    const logOff = menu.getByRole("menuitem", { name: "Log off" });
    expect(logOff.tagName).toBe("A");
    expect(logOff.getAttribute("href")).toBe("/auth/sign-out");
    expect(menu.getByText("Team Lead · Leads Kitchen")).toBeTruthy();
  });

  it("sits above every window and all chrome, at most half the screen high", () => {
    render(<Desktop {...props()} />);
    openStart();
    const menu = screen.getByRole("menu", { name: "Start" });
    expect(menu.className).toContain("z-[100]");
    expect(menu.className).toContain("md:max-h-[50dvh]");
    expect(menu.className).toContain("select-none");
  });

  it("lines the icons up again, and saves that", () => {
    vi.useFakeTimers();
    render(
      <Desktop
        {...props({ layout: { cells: { tasks: { c: 5, r: 5 } }, items: [] } })}
      />,
    );
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Line up icons" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(save).toHaveBeenCalledWith({ cells: {}, items: [] });
  });

  it("shows the desktop: every window down, the address to the desktop", () => {
    render(<Desktop {...props()} />);
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show desktop" }));
    expect(nav.replace).toHaveBeenCalledWith("/");
    const frame = document.querySelector<HTMLElement>('[data-window="tasks"]');
    expect(frame?.hidden).toBe(true);
  });
});

// The desktop's taskbar. The phone's home screen and bottom bar are in the
// DOM too (CSS picks one by width, and jsdom draws no CSS), so tray checks
// look inside the taskbar.
const taskbar = () => within(screen.getByRole("toolbar", { name: "Taskbar" }));

describe("the tray", () => {
  it("gives a member one plain sentence when something is wrong, and no link", () => {
    render(<Desktop {...props({}, { healthWarnings: 2 })} />);
    const item = taskbar().getByRole("button", { name: "System health" });
    expect(taskbar().queryByText(HEALTH_SENTENCE)).toBeNull();
    fireEvent.click(item);
    expect(taskbar().getByRole("status").textContent).toBe(HEALTH_SENTENCE);
    expect(screen.queryByRole("link", { name: /system/i })).toBeNull();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("gives a captain the count, and opens System status", () => {
    render(
      <Desktop
        {...props({}, { rank: ViewerRank.enum.captain, healthWarnings: 2 })}
      />,
    );
    fireEvent.click(
      taskbar().getByRole("button", { name: "System health, 2 warnings" }),
    );
    expect(nav.push).toHaveBeenCalledWith("/captains/system");
  });

  it("draws no health item when all is well", () => {
    render(<Desktop {...props()} />);
    expect(screen.queryByRole("button", { name: /System health/ })).toBeNull();
  });

  it("shows the restricted desktop's balloon, and no pins or health", () => {
    nav.pathname = "/notifications";
    render(
      <Desktop
        {...props(
          { mode: "restricted", pins: [{ id: "a-1", title: "Water" }] },
          { healthWarnings: 3 },
        )}
      />,
    );
    expect(taskbar().getByRole("status").textContent).toBe(
      APPLICATION_SUBMITTED,
    );
    expect(screen.queryByRole("button", { name: /System health/ })).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Pinned announcements" }),
    ).toBeNull();
  });

  it("shows the clock and the days to the Burn, once mounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-04-01T10:00:00Z"));
    render(
      <Desktop
        {...props({ burn: { start: "2027-04-26", end: "2027-05-02" } })}
      />,
    );
    expect(screen.getByText("25 days to the Burn")).toBeTruthy();
    // 10:00Z is 12:00 at camp.
    expect(document.querySelector("time")?.textContent).toContain("12:00");
  });
});

describe("pinned announcements", () => {
  const pins = [
    { id: "a-1", title: "Water points moved" },
    { id: "a-2", title: "Kitchen shift swap" },
  ];

  it("draws a strip with one pin at a time, and a tray count", () => {
    render(<Desktop {...props({ pins })} />);
    const strip = screen.getByRole("region", { name: "Pinned announcements" });
    expect(strip.textContent).toContain("Water points moved");
    expect(strip.textContent).toContain("1 of 2");
    fireEvent.click(
      within(strip).getByRole("button", { name: "Next pinned announcement" }),
    );
    expect(strip.textContent).toContain("Kitchen shift swap");
    expect(
      screen.getByRole("button", { name: "Pinned announcements, 2 pinned" }),
    ).toBeTruthy();
  });

  it("opens the pin's own page the desktop's way", () => {
    render(<Desktop {...props({ pins: pins.slice(0, 1) })} />);
    const strip = screen.getByRole("region", { name: "Pinned announcements" });
    // One pin: nothing to page through, and no way to dismiss it.
    expect(within(strip).queryAllByRole("button")).toHaveLength(0);
    const read = within(strip).getByRole("link", { name: /Read/ });
    expect(read.getAttribute("href")).toBe("/announcements/a-1");
    fireEvent.click(read);
    expect(nav.push).toHaveBeenCalledWith("/announcements/a-1");
  });
});

describe("the Terminal", () => {
  beforeEach(() => {
    // jsdom draws nothing, so it has no scrolling to do.
    Element.prototype.scrollIntoView = vi.fn();
  });

  function terminal() {
    nav.pathname = "/terminal";
    const manifest = buildProgramManifest(facts());
    const context = terminalContext(manifest, { name: "Ada", rank: "Member" });
    render(
      <Desktop {...props({ manifest })}>
        <TerminalProgram context={context} />
      </Desktop>,
    );
    return screen.getByRole("textbox");
  }
  const type = (input: HTMLElement, line: string) => {
    fireEvent.change(input, { target: { value: line } });
    fireEvent.submit(input.closest("form")!);
  };

  it("opens a program the desktop's way", () => {
    vi.useFakeTimers();
    const input = terminal();
    expect(screen.getByRole("region", { name: "Terminal" })).toBeTruthy();
    type(input, "open roster");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(nav.push).toHaveBeenCalledWith("/captains/camp-management");
  });

  it("answers a program the member does not have as not found, and opens nothing", () => {
    vi.useFakeTimers();
    const input = terminal();
    type(input, "open audit");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole("log").textContent).toMatch(/audit: not found/);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("closes its own window on exit", () => {
    const input = terminal();
    type(input, "exit");
    expect(nav.replace).toHaveBeenCalledWith("/");
    expect(document.querySelector('[data-window="terminal"]')).toBeNull();
  });
});
