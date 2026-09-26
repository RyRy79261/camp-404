import { useState } from "react";
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
import { useKeptDraft, useWindowDirty } from "@camp404/os";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";

// The phone's Classic desktop (below md). Its layout is CSS (jsdom draws
// none), so these check the markup the CSS keys on (`md:hidden`,
// `max-md:hidden`, the frame's responsive classes) and the phone's own
// behaviour: Home, Open programs, Today, and a Back that closes the window
// it left. Ranks and team keys come from the enums the code uses.

const nav = vi.hoisted(() => ({
  pathname: "/tasks",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
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
  saveDesktopLayoutAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(console)/notifications/actions", () => ({
  fetchNotificationPanelAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("@/components/push/device-token", () => ({
  forgetDeviceToken: vi.fn(),
}));

import { Desktop, type DesktopProps } from "../desktop-shell";
import { draftStorageKey, windowStorageKey } from "../window-storage";

const KITCHEN = Team.enum.kitchen;

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: ViewerRank.enum.camp_member,
    memberships: [{ team: KITCHEN, isLead: true }],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

function props(over: Partial<DesktopProps> = {}): DesktopProps {
  return {
    mode: "full",
    manifest: buildProgramManifest(facts()),
    // The member's own shortcut and folder: desktop only.
    layout: {
      cells: {},
      items: [
        { kind: "shortcut", id: "shortcut:1", target: "tasks" },
        { kind: "folder", id: "folder:mine-1", name: "Bits", items: [] },
      ],
    },
    userId: "u-1",
    account: { name: "Ada", rank: "Member", leads: ["Kitchen"] },
    children: <h1>The page</h1>,
    ...over,
  };
}

/** The screen is a phone (below md) for everything that asks. */
function phoneScreen(matches = true) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

const home = () =>
  within(document.querySelector<HTMLElement>("[data-os-phone-home]")!);
const bar = () => within(screen.getByRole("toolbar", { name: "Bottom bar" }));
const frame = (key: string) =>
  document.querySelector<HTMLElement>(`[data-window="${key}"]`);

function storedWindow(key: string, lastUrl: string, z = 1) {
  return {
    key,
    programId: key,
    lastUrl,
    rect: { x: 0, y: 0, w: 400, h: 300 },
    z,
    minimized: false,
    maximized: false,
    scrollTop: 0,
  };
}

beforeEach(() => {
  nav.pathname = "/tasks";
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/tasks");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("the home screen", () => {
  it("draws the desktop's groups as big icons, then My teams, and no member items", () => {
    nav.pathname = "/";
    render(<Desktop {...props()} />);
    const phone = document.querySelector("[data-os-phone-home]")!;
    // Drawn for a phone only; the desktop's grid for md and up.
    expect(phone.className).toContain("md:hidden");
    expect(
      screen.getByRole("listbox", { name: "Desktop" }).className,
    ).toContain("max-md:hidden");

    const groups = [...phone.querySelectorAll("nav")].map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(groups).toEqual(["Me", "Camp", "My teams"]);
    const teams = home().getByRole("navigation", { name: "My teams" });
    expect(
      within(teams).getByRole("button", { name: "Kitchen team, you lead it" }),
    ).toBeTruthy();
    expect(home().getByRole("button", { name: "Tasks" })).toBeTruthy();
    // The member's own shortcut and folder stay on the desktop.
    expect(home().queryByRole("button", { name: /shortcut/ })).toBeNull();
    expect(home().queryByRole("button", { name: /Bits/ })).toBeNull();
    // Log off goes through SignOutLink, never a plain link.
    expect(home().getByRole("link", { name: "Log off" })).toBeTruthy();
  });

  it("opens a program with a push, and a folder as a full-screen sheet", () => {
    nav.pathname = "/";
    render(<Desktop {...props()} />);
    fireEvent.click(home().getByRole("button", { name: "Tasks" }));
    expect(nav.push).toHaveBeenCalledWith("/tasks");

    fireEvent.click(
      home().getByRole("button", { name: "Kitchen team, you lead it" }),
    );
    const sheet = screen.getByRole("region", { name: "Kitchen team" });
    expect(sheet.className).toContain("max-md:fixed");
    expect(sheet.className).not.toContain("max-md:hidden");
    expect(
      within(sheet).getByRole("button", { name: "Back, close Kitchen team" }),
    ).toBeTruthy();
  });
});

describe("one window at a time", () => {
  it("shows the live page full screen and keeps background copies off the phone", () => {
    window.sessionStorage.setItem(
      windowStorageKey("u-1"),
      JSON.stringify({
        mode: "full",
        windows: [storedWindow("calendar", "/calendar")],
      }),
    );
    render(<Desktop {...props()} />);
    expect(frame("tasks")!.className).not.toContain("max-md:hidden");
    expect(frame("calendar")!.className).toContain("max-md:hidden");
    // Nothing inline places a window: the phone's classes win at 390 px.
    expect(frame("tasks")!.style.left).toBe("");
  });
});

describe("the bottom bar", () => {
  it("Home puts every window away and pushes the home screen", () => {
    render(<Desktop {...props()} />);
    fireEvent.click(bar().getByRole("button", { name: "Home" }));
    expect(nav.push).toHaveBeenCalledWith("/");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(frame("tasks")!.hidden).toBe(true);
  });

  it("Home asks first when the page has unsaved input, and stays on no", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    function Dirty() {
      useWindowDirty(true, "Unsaved. Leave?");
      return <h1>Editor</h1>;
    }
    render(
      <Desktop {...props()}>
        <Dirty />
      </Desktop>,
    );
    fireEvent.click(bar().getByRole("button", { name: "Home" }));
    expect(confirm).toHaveBeenCalledWith("Unsaved. Leave?");
    expect(nav.push).not.toHaveBeenCalled();
    expect(frame("tasks")!.hidden).toBe(false);
  });

  it("lists open programs, goes to one, and closes one", () => {
    window.sessionStorage.setItem(
      windowStorageKey("u-1"),
      JSON.stringify({
        mode: "full",
        windows: [storedWindow("calendar", "/calendar")],
      }),
    );
    render(<Desktop {...props()} />);
    fireEvent.click(bar().getByRole("button", { name: "Open programs, 2" }));
    const sheet = within(screen.getByRole("region", { name: "Open programs" }));
    const rows = sheet
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(rows).toContain("Close Calendar");
    fireEvent.click(sheet.getByRole("button", { name: /^Calendar/ }));
    expect(nav.push).toHaveBeenCalledWith("/calendar");

    fireEvent.click(bar().getByRole("button", { name: "Open programs, 2" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Open programs" })).getByRole(
        "button",
        { name: "Close Calendar" },
      ),
    );
    expect(frame("calendar")).toBeNull();
  });

  it("Today opens a sheet on the home screen, and from a program goes home first", () => {
    phoneScreen();
    nav.pathname = "/";
    const view = render(
      <Desktop {...props({ today: { count: 0, body: <p>Your day</p> } })} />,
    );
    expect(screen.queryByText("Your day")).toBeNull();
    fireEvent.click(bar().getByRole("button", { name: "Today" }));
    expect(
      within(screen.getByRole("region", { name: "Today" })).getByText(
        "Your day",
      ),
    ).toBeTruthy();
    // Its body is in the sheet only: the desktop's handle holds nothing.
    expect(screen.getAllByText("Your day")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close Today" }));
    expect(screen.queryByText("Your day")).toBeNull();
    view.unmount();

    nav.pathname = "/tasks";
    render(
      <Desktop {...props({ today: { count: 0, body: <p>Your day</p> } })} />,
    );
    fireEvent.click(bar().getByRole("button", { name: "Today" }));
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("steps aside while the soft keyboard is up", () => {
    phoneScreen();
    const viewport = Object.assign(new EventTarget(), { height: 780 });
    vi.stubGlobal("visualViewport", viewport);
    render(<Desktop {...props()} />);
    const toolbar = screen.getByRole("toolbar", { name: "Bottom bar" });
    expect(toolbar.hidden).toBe(false);
    act(() => {
      viewport.height = window.innerHeight - 300;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(toolbar.hidden).toBe(true);
    expect(
      document.getElementById("os-desktop")!.hasAttribute("data-os-keyboard"),
    ).toBe(true);
  });
});

describe("Back on a phone", () => {
  function Note() {
    const kept = useKeptDraft();
    const [text, setText] = useState(typeof kept === "string" ? kept : "");
    useWindowDirty(text !== "", "Unsaved note. Leave?", text);
    return (
      <input
        aria-label="Note"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    );
  }

  it("closes the window it left, without asking, and never loses a draft", () => {
    phoneScreen();
    const confirm = vi.spyOn(window, "confirm");
    nav.pathname = "/meetings/new";
    window.history.replaceState(null, "", "/meetings/new");
    const view = render(
      <Desktop {...props()}>
        <Note />
      </Desktop>,
    );
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "half a thought" },
    });
    // Back to the page before: the browser moves first, then the router.
    window.history.replaceState(null, "", "/tasks");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    nav.pathname = "/tasks";
    view.rerender(
      <Desktop {...props()}>
        <h1>Tasks page</h1>
      </Desktop>,
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(frame("new-meeting")).toBeNull();
    expect(frame("tasks")).not.toBeNull();

    // Opened again in the same session: the draft is back.
    nav.pathname = "/meetings/new";
    view.rerender(
      <Desktop {...props()}>
        <Note />
      </Desktop>,
    );
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe(
      "half a thought",
    );
  });

  it("on a desktop, Back keeps the window it left open", () => {
    phoneScreen(false);
    nav.pathname = "/calendar";
    window.history.replaceState(null, "", "/calendar");
    const view = render(<Desktop {...props()} />);
    window.history.replaceState(null, "", "/tasks");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    nav.pathname = "/tasks";
    view.rerender(<Desktop {...props()} />);
    expect(frame("calendar")).not.toBeNull();
    expect(frame("tasks")).not.toBeNull();
  });
});

describe("closing on purpose", () => {
  it("drops the window's stored draft", () => {
    window.sessionStorage.setItem(
      draftStorageKey("u-1", "tasks", "note"),
      '{"text":"x"}',
    );
    window.sessionStorage.setItem(
      draftStorageKey("u-1", "calendar", "note"),
      '{"text":"y"}',
    );
    render(<Desktop {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Close Tasks" }));
    expect(
      window.sessionStorage.getItem(draftStorageKey("u-1", "tasks", "note")),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(draftStorageKey("u-1", "calendar", "note")),
    ).not.toBeNull();
  });
});
