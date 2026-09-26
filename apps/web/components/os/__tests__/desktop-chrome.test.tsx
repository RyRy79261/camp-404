import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { windowStorageKey } from "../window-storage";
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
  it("stands the groups in the prototype's columns, then Tidy windows, Line up icons, Show desktop, Report a problem and Log off", () => {
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
    const nav = screen.getByRole("navigation", { name: "Console" });
    const menu = within(nav);
    const groups = menu
      .getAllByRole("group")
      .map((g) => g.getAttribute("aria-label"));
    // Me with My teams under it, Camp with the Kitchen under it, Captains.
    expect(groups).toEqual(["Me", "My teams", "Camp", "Kitchen", "Captains"]);
    // The member's own team is a row in My teams, tagged as theirs to lead,
    // and the Teams folder follows it.
    const myTeams = within(menu.getByRole("group", { name: "My teams" }));
    expect(
      myTeams.getByRole("menuitem", { name: "Kitchen, you lead it" }),
    ).toBeTruthy();
    expect(myTeams.getByRole("menuitem", { name: "Teams" }).tagName).toBe(
      "BUTTON",
    );
    // The folders are opened out: their programs are rows of their own.
    expect(
      within(menu.getByRole("group", { name: "Kitchen" })).getByRole(
        "menuitem",
        { name: "Recipes" },
      ),
    ).toBeTruthy();
    const captains = within(menu.getByRole("group", { name: "Captains" }));
    expect(
      captains.getByRole("menuitem", { name: "Questionnaires" }),
    ).toBeTruthy();
    expect(captains.getByRole("menuitem", { name: "Terminal" })).toBeTruthy();
    const rows = menu.getAllByRole("menuitem").map((el) => el.textContent);
    expect(rows.slice(-5)).toEqual([
      "Tidy windows",
      "Line up icons",
      "Show desktop",
      "Report a problem",
      "Log off",
    ]);
    // Log off is the sign-out link, never a plain button.
    const logOff = menu.getByRole("menuitem", { name: "Log off" });
    expect(logOff.tagName).toBe("A");
    expect(logOff.getAttribute("href")).toBe("/auth/sign-out");
    expect(menu.getByText("Team Lead · Leads Kitchen")).toBeTruthy();
  });

  it("tidies the windows: back to their opening size, cascaded, none full screen", () => {
    window.sessionStorage.setItem(
      windowStorageKey(props().userId),
      JSON.stringify({
        mode: "full",
        windows: [
          {
            key: "calendar",
            programId: "calendar",
            lastUrl: "/calendar",
            rect: { x: 500, y: 300, w: 300, h: 200 },
            z: 1,
            minimized: false,
            maximized: true,
            scrollTop: 0,
          },
        ],
      }),
    );
    render(<Desktop {...props()} />);
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Tidy windows" }));
    const frames = [
      ...document.querySelectorAll<HTMLElement>("section[data-window]"),
    ];
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f.hasAttribute("data-maximized")).toBe(false);
    }
    const tasks = document.querySelector<HTMLElement>('[data-window="tasks"]')!;
    const x = (el: HTMLElement) =>
      parseInt(el.style.getPropertyValue("--win-x"));
    const cal = document.querySelector<HTMLElement>('[data-window="calendar"]');
    if (cal) expect(x(tasks)).toBeGreaterThan(x(cal));
    // The live window stays on top.
    expect(tasks.hasAttribute("data-top")).toBe(true);
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

  it("draws a strip in the header with one pin at a time", () => {
    render(<Desktop {...props({ pins })} />);
    const strip = screen.getByRole("region", { name: "Pinned announcements" });
    expect(strip.closest("header")).not.toBeNull();
    expect(strip.textContent).toContain("Water points moved");
    expect(strip.textContent).toContain("1 of 2");
    fireEvent.click(
      within(strip).getByRole("button", { name: "Next pinned announcement" }),
    );
    expect(strip.textContent).toContain("Kitchen shift swap");
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

describe("the cats' places", () => {
  it("puts Prince on the clock and Shadow Work under the Teams folder's icons, never labelled", async () => {
    render(<Desktop {...props()} />);
    // On the taskbar's clock. The cats arrive after the desktop
    // (desktop-cats.tsx loads them lazily). An easter egg: no name, no Tab
    // stop, hidden from assistive tech.
    const taskbar = screen.getByRole("toolbar", { name: "Taskbar" });
    await waitFor(() =>
      expect(taskbar.querySelector('[data-cat="prince"]')).not.toBeNull(),
    );
    const prince = taskbar.querySelector<HTMLElement>('[data-cat="prince"]')!;
    expect(prince.getAttribute("aria-hidden")).toBe("true");
    expect(prince.tabIndex).toBe(-1);
    expect(
      within(taskbar).queryByRole("button", {
        name: /^(a cat|prince|jinn)\b/i,
      }),
    ).toBeNull();
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Teams" }));
    const teams = document.querySelector<HTMLElement>(
      'section[data-window-title="Teams"]',
    )!;
    expect(teams).not.toBeNull();
    await waitFor(() =>
      expect(teams.querySelector("[data-shadow-work]")).not.toBeNull(),
    );
    const art = teams.querySelector<HTMLElement>("[data-shadow-work]")!;
    expect(art.getAttribute("aria-hidden")).toBe("true");
    // Below the icons, outside their list.
    const list = within(teams).getByRole("list", { name: "Teams" });
    expect(list.contains(art)).toBe(false);
  });
});

describe("the cats keep out of the way", () => {
  const KEYS = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
  ];
  const prince = () =>
    document.querySelector<HTMLElement>(
      '[role="toolbar"][aria-label="Taskbar"] [data-cat="prince"]',
    );
  /** The lazy cats (and the secret keys, in the same chunk) have arrived. */
  const catsHere = () => waitFor(() => expect(prince()).not.toBeNull());
  const konami = () =>
    KEYS.forEach((key) => fireEvent.keyDown(window, { key }));

  it("the full desktop's secret keys open the Terminal's game", async () => {
    render(<Desktop {...props()} />);
    await catsHere();
    await waitFor(() => {
      konami();
      expect(nav.push).toHaveBeenCalledWith("/terminal/inkblot");
    });
  });

  it("an applicant waiting for approval has no secret keys to press", async () => {
    render(<Desktop {...props({ mode: "restricted" })} />);
    await catsHere();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    konami();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("Prince lets taps through to a window that reaches the clock", async () => {
    const view = render(<Desktop {...props()} />);
    await catsHere();
    // The Tasks window opens right of the icons, clear of the bar.
    expect(prince()!.className).not.toContain("pointer-events-none");
    fireEvent.doubleClick(
      document.querySelector<HTMLElement>(
        '[data-window="tasks"] [data-titlebar]',
      )!,
    );
    view.rerender(<Desktop {...props()} />);
    expect(prince()!.className).toContain("pointer-events-none");
  });
});

describe("a captain's Start menu header", () => {
  it("counts the camp's members over the sign-ups waiting", () => {
    render(<Desktop {...props({ headcount: { members: 34, waiting: 6 } })} />);
    openStart();
    const menu = screen.getByRole("menu", { name: "Start" });
    expect(menu.textContent).toContain("34 members");
    expect(menu.textContent).toContain("6 waiting");
  });

  it("says nothing of the sort for anyone else", () => {
    render(<Desktop {...props()} />);
    openStart();
    expect(screen.getByRole("menu", { name: "Start" }).textContent).not.toMatch(
      /waiting/,
    );
  });
});
