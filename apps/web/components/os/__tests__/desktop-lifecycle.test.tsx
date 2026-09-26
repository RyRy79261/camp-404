import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import { useKeptDraft, useWindowDirty } from "@camp404/os";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";

// What the desktop keeps, and when it lets go: last-seen copies and kept
// drafts outlive a new count but never the access they were taken under; the
// refreshes that let the manifest catch up; and the keyboard's way back after
// the last window closes. Driven with a stand-in router, as in
// desktop-shell.test.tsx: the address is what `usePathname` returns.

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
import { draftStorageKey } from "../window-storage";

const CAPTAIN = ViewerRank.enum.captain;
const MEMBER = ViewerRank.enum.camp_member;
const KITCHEN = Team.enum.kitchen;

function manifest(over: Partial<ProgramFacts> = {}) {
  return buildProgramManifest({
    mode: "full",
    approved: true,
    rank: MEMBER,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  });
}

function props(over: Partial<DesktopProps> = {}): DesktopProps {
  return {
    mode: "full",
    manifest: manifest(),
    layout: { cells: {}, items: [] },
    userId: "u-1",
    account: { name: "Ada", rank: "Member", leads: [] },
    children: <h1>The page</h1>,
    ...over,
  };
}

/** A window's frame, by its key. */
const frame = (key: string) =>
  document.querySelector<HTMLElement>(`[data-window="${key}"]`);
const frames = () =>
  [...document.querySelectorAll("[data-window]")].map((el) =>
    el.getAttribute("data-window"),
  );

/** Let the desktop's idle work run (its copy of the live window). */
async function idle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
}

/** The stand-in router's move to `path` (the next render shows it). */
function arrive(path: string) {
  nav.pathname = path;
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  nav.pathname = "/tasks";
  window.history.replaceState(null, "", "/tasks");
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("last-seen copies and the manifest", () => {
  /** A captain who worked in Calendar, then the Audit log, and is now in Tasks. */
  async function captainWithCopies(m = manifest({ rank: CAPTAIN })) {
    arrive("/calendar");
    const view = render(<Desktop {...props({ manifest: m })} />);
    await idle();
    arrive("/captains/audit");
    view.rerender(
      <Desktop {...props({ manifest: m })}>
        <h1>Audit log</h1>
      </Desktop>,
    );
    await idle();
    arrive("/tasks");
    view.rerender(
      <Desktop {...props({ manifest: m })}>
        <h1>Tasks</h1>
      </Desktop>,
    );
    expect(frame("calendar")?.textContent).toMatch(/Last seen \d\d:\d\d/);
    expect(frame("audit")?.textContent).toMatch(/Last seen \d\d:\d\d/);
    return view;
  }

  it("keeps every copy when only a count changes", async () => {
    const quiet = manifest({ rank: CAPTAIN });
    const busy = manifest({ rank: CAPTAIN, inbox: 7, healthWarnings: 2 });
    expect(busy.version).toBe(quiet.version);
    const view = await captainWithCopies(quiet);
    view.rerender(
      <Desktop {...props({ manifest: busy })}>
        <h1>Tasks</h1>
      </Desktop>,
    );
    expect(frame("calendar")?.textContent).toMatch(/Last seen/);
    expect(frame("audit")?.textContent).toMatch(/Last seen/);
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("drops every copy, and closes the captain's windows, on a demotion", async () => {
    // A draft typed into the Audit log's window, kept in this tab.
    const auditDraft = draftStorageKey("u-1", "audit", "notes");
    const tasksDraft = draftStorageKey("u-1", "tasks", "notes");
    window.sessionStorage.setItem(auditDraft, '"typed as captain"');
    window.sessionStorage.setItem(tasksDraft, '"still mine"');
    const view = await captainWithCopies();

    view.rerender(
      <Desktop {...props({ manifest: manifest({ rank: MEMBER }) })}>
        <h1>Tasks</h1>
      </Desktop>,
    );
    expect(frames()).not.toContain("audit");
    expect(frame("calendar")?.textContent).not.toMatch(/Last seen/);
    expect(frame("calendar")?.textContent).toContain("Click to open.");
    expect(window.sessionStorage.getItem(auditDraft)).toBeNull();
    expect(window.sessionStorage.getItem(tasksDraft)).toBe('"still mine"');
  });

  it("drops every copy when another member signs in on the tab", async () => {
    const view = await captainWithCopies();
    view.rerender(
      <Desktop
        {...props({ manifest: manifest({ rank: CAPTAIN }), userId: "u-2" })}
      >
        <h1>Tasks</h1>
      </Desktop>,
    );
    expect(frame("calendar")?.textContent).not.toMatch(/Last seen/);
    expect(frame("audit")?.textContent).not.toMatch(/Last seen/);
  });
});

describe("kept drafts and the manifest", () => {
  function Dirty() {
    useWindowDirty(true, "Unsaved. Leave?", { text: "typed words" });
    return <h1>Tasks</h1>;
  }
  function Reader() {
    const kept = useKeptDraft() as { text: string } | undefined;
    return <p>Kept: {kept?.text ?? "nothing"}</p>;
  }

  /** Typing in Tasks, then a Back to Calendar: nobody could be asked. */
  function leaveTasksDirty(m: DesktopProps["manifest"]) {
    const view = render(
      <Desktop {...props({ manifest: m })}>
        <Dirty />
      </Desktop>,
    );
    nav.pathname = "/calendar";
    view.rerender(
      <Desktop {...props({ manifest: m })}>
        <h1>Calendar</h1>
      </Desktop>,
    );
    return view;
  }
  function backToTasks(
    view: ReturnType<typeof render>,
    over: Partial<DesktopProps>,
  ) {
    nav.pathname = "/tasks";
    view.rerender(
      <Desktop {...props(over)}>
        <Reader />
      </Desktop>,
    );
  }

  it("keeps a draft through a new count", () => {
    const view = leaveTasksDirty(manifest());
    view.rerender(
      <Desktop {...props({ manifest: manifest({ inbox: 4 }) })}>
        <h1>Calendar</h1>
      </Desktop>,
    );
    backToTasks(view, { manifest: manifest({ inbox: 4 }) });
    expect(screen.getByText("Kept: typed words")).toBeTruthy();
  });

  it("drops it when access changes, even to a program still open to them", () => {
    const lead = manifest({
      rank: ViewerRank.enum.team_lead,
      memberships: [{ team: KITCHEN, isLead: true }],
    });
    const view = leaveTasksDirty(lead);
    const demoted = manifest({
      memberships: [{ team: KITCHEN, isLead: false }],
    });
    expect(demoted.version).not.toBe(lead.version);
    view.rerender(
      <Desktop {...props({ manifest: demoted })}>
        <h1>Calendar</h1>
      </Desktop>,
    );
    backToTasks(view, { manifest: demoted });
    expect(screen.getByText("Kept: nothing")).toBeTruthy();
  });

  it("drops it when another member signs in on the tab", () => {
    const view = leaveTasksDirty(manifest());
    view.rerender(
      <Desktop {...props({ manifest: manifest(), userId: "u-2" })}>
        <h1>Calendar</h1>
      </Desktop>,
    );
    backToTasks(view, { manifest: manifest(), userId: "u-2" });
    expect(screen.getByText("Kept: nothing")).toBeTruthy();
  });
});

describe("the refreshes that let the manifest catch up", () => {
  function setVisibility(state: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("refreshes a tab shown again after five minutes or more, not sooner", () => {
    const now = vi.spyOn(Date, "now");
    render(<Desktop {...props()} />);
    now.mockReturnValue(1_000_000);
    setVisibility("hidden");
    now.mockReturnValue(1_000_000 + 4 * 60_000);
    setVisibility("visible");
    expect(nav.refresh).not.toHaveBeenCalled();

    now.mockReturnValue(2_000_000);
    setVisibility("hidden");
    now.mockReturnValue(2_000_000 + 5 * 60_000);
    setVisibility("visible");
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes once for a page the gate refused (a CaptainLock), per address", async () => {
    nav.pathname = "/captains/audit";
    const page = (
      <div>
        <h1>Audit log</h1>
        <div data-captain-lock="" />
      </div>
    );
    const view = render(<Desktop {...props()}>{page}</Desktop>);
    await idle();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    view.rerender(
      <Desktop
        {...props({ account: { name: "Ada", rank: "Member", leads: ["x"] } })}
      >
        {page}
      </Desktop>,
    );
    await idle();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes when a gate sends the member somewhere the desktop did not", async () => {
    window.sessionStorage.setItem(
      "camp404.os.v1:u-1",
      JSON.stringify({
        mode: "full",
        windows: [
          {
            key: "calendar",
            programId: "calendar",
            lastUrl: "/calendar",
            rect: { x: 0, y: 0, w: 400, h: 300 },
            z: 1,
            minimized: false,
            maximized: false,
            scrollTop: 0,
          },
        ],
      }),
    );
    const view = render(<Desktop {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Calendar window" }));
    expect(nav.push).toHaveBeenCalledWith("/calendar");
    // Arrived where it was sent: nothing to catch up on.
    nav.pathname = "/calendar";
    view.rerender(<Desktop {...props()} />);
    expect(nav.refresh).not.toHaveBeenCalled();

    // Sent to Tasks, but the gate put them on the desktop instead.
    fireEvent.click(screen.getByRole("button", { name: "Tasks window" }));
    expect(nav.push).toHaveBeenLastCalledWith("/tasks");
    nav.pathname = "/";
    view.rerender(<Desktop {...props()} />);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("keyboard and screen readers", () => {
  it("closing the only window by keyboard hands focus to its icon", async () => {
    const view = render(<Desktop {...props()} />);
    const close = screen.getByRole("button", { name: "Close Tasks" });
    close.focus();
    fireEvent.click(close);
    expect(nav.replace).toHaveBeenCalledWith("/");
    nav.pathname = "/";
    view.rerender(<Desktop {...props()} />);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tasks");
    expect(document.activeElement?.getAttribute("role")).toBe("option");
  });

  it("Skip to window focuses the page, without the gate's Checking…", () => {
    render(<Desktop {...props()} />);
    fireEvent.click(screen.getByRole("link", { name: "Skip to window" }));
    expect(document.activeElement?.id).toBe("os-window-content");
    // A popstate for the same address (a fragment link) is no history move.
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(document.getElementById("os-window-content")?.hidden).toBe(false);
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("puts the phone's home screen to sleep while a program covers it", () => {
    const view = render(<Desktop {...props()} />);
    const home = () => document.querySelector("[data-os-phone-home]")!;
    expect(home().hasAttribute("inert")).toBe(true);
    nav.pathname = "/";
    view.rerender(<Desktop {...props()} />);
    expect(home().hasAttribute("inert")).toBe(false);
  });

  it("a background window is no landmark and has no tab stops", async () => {
    arrive("/calendar");
    const view = render(<Desktop {...props()} />);
    arrive("/tasks");
    view.rerender(<Desktop {...props()} />);
    expect(screen.getByRole("region", { name: "Tasks" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Calendar" })).toBeNull();
    for (const b of frame("calendar")!.querySelectorAll("button")) {
      expect(b.tabIndex).toBe(-1);
    }
  });
});

describe("Today docked open on the desktop", () => {
  afterEach(() => window.localStorage.clear());
  const grid = () => document.querySelector<HTMLElement>("[data-os-icons]")!;

  it("stops the icon grid at its left edge, so no icon sits under it", () => {
    window.localStorage.setItem("camp404.os.today-open", "true");
    nav.pathname = "/";
    render(<Desktop {...props()} />);
    expect(grid().className).toContain("right-[22.75rem]");
  });

  it("gives the grid the whole width while Today is closed, or in a program", () => {
    window.localStorage.setItem("camp404.os.today-open", "false");
    nav.pathname = "/";
    const view = render(<Desktop {...props()} />);
    expect(grid().className).toContain("right-0");
    window.localStorage.setItem("camp404.os.today-open", "true");
    nav.pathname = "/tasks";
    view.rerender(<Desktop {...props()} />);
    expect(grid().className).toContain("right-0");
  });
});

describe("held by a blocking questionnaire", () => {
  it("names the layer by the form's own title", () => {
    nav.pathname = "/questionnaires/act-1";
    render(
      <Desktop {...props({ mode: "held" })}>
        <h1>Tent check</h1>
      </Desktop>,
    );
    expect(screen.getByRole("dialog", { name: "Tent check" })).toBeTruthy();
  });

  it("draws the inbox bare, with no layer and no desktop", () => {
    nav.pathname = "/notifications";
    render(
      <Desktop {...props({ mode: "held" })}>
        <h1>Notifications</h1>
      </Desktop>,
    );
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("os-desktop")).toBeNull();
  });
});

describe("the layout is kept", () => {
  it("saves an icon move at once when the page goes, not 800 ms later", () => {
    render(
      <Desktop
        {...props({ layout: { cells: { tasks: { c: 5, r: 5 } }, items: [] } })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Line up icons" }));
    expect(save).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ cells: {}, items: [] });
  });

  it("saves it when the desktop goes, too", () => {
    const view = render(
      <Desktop
        {...props({ layout: { cells: { tasks: { c: 5, r: 5 } }, items: [] } })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Line up icons" }));
    view.unmount();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
