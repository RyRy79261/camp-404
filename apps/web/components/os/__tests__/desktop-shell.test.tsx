import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { ViewerRank } from "@camp404/types";
import { useWindowDirty } from "@camp404/os";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";

// The desktop shell: the URL is the focused window. These drive it with a
// stand-in router: the address is what `usePathname` returns, and a push or
// replace is recorded (the real router would then change the address).

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
import { HeldScreen } from "../held-screen";
import { windowStorageKey } from "../window-storage";

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

function props(over: Partial<DesktopProps> = {}): DesktopProps {
  const mode = over.mode ?? "full";
  return {
    mode,
    manifest: buildProgramManifest(facts({ mode, approved: mode !== "held" })),
    layout: { cells: {}, items: [] },
    userId: "u-1",
    account: { name: "Ada", rank: "Member", leads: [] },
    children: <h1>The page</h1>,
    ...over,
  };
}

const frames = () =>
  [...document.querySelectorAll("[data-window]")].map((el) =>
    el.getAttribute("data-window"),
  );

beforeEach(() => {
  nav.pathname = "/tasks";
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the URL is the focused window", () => {
  it("draws the page, once, in its window, titled with its plain name", () => {
    render(<Desktop {...props()} />);
    expect(frames()).toEqual(["tasks"]);
    const win = screen.getByRole("region", { name: "Tasks" });
    expect(win.textContent).toContain("The page");
    expect(screen.getAllByRole("heading", { name: "The page" })).toHaveLength(
      1,
    );
  });

  it("puts the desktop's own page on the desktop, in no window", () => {
    nav.pathname = "/";
    render(<Desktop {...props()} />);
    expect(frames()).toEqual([]);
    expect(screen.getByRole("heading", { name: "The page" })).toBeTruthy();
  });

  it("closing the page's window replaces the address with the desktop", () => {
    render(<Desktop {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Close Tasks" }));
    expect(nav.replace).toHaveBeenCalledWith("/");
    expect(nav.push).not.toHaveBeenCalled();
    expect(frames()).toEqual([]);
  });

  it("minimising it replaces the address too, and keeps the window", () => {
    render(<Desktop {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Minimise Tasks" }));
    expect(nav.replace).toHaveBeenCalledWith("/");
    expect(frames()).toEqual(["tasks"]);
  });

  it("closing hands the address to the next window down", () => {
    window.sessionStorage.setItem(
      windowStorageKey("u-1"),
      JSON.stringify({
        mode: "full",
        windows: [
          {
            key: "meeting:m-1",
            programId: "meeting",
            lastUrl: "/meetings/m-1",
            rect: { x: 0, y: 0, w: 400, h: 300 },
            z: 1,
            minimized: false,
            maximized: false,
            scrollTop: 0,
          },
        ],
      }),
    );
    render(<Desktop {...props()} />);
    expect(frames().sort()).toEqual(["meeting:m-1", "tasks"]);
    fireEvent.click(screen.getByRole("button", { name: "Close Tasks" }));
    expect(nav.replace).toHaveBeenCalledWith("/meetings/m-1");
  });
});

describe("the stack kept for this tab", () => {
  it("restores console windows as frames with no copy, and drops the rest", () => {
    const rect = { x: 0, y: 0, w: 400, h: 300 };
    const w = (key: string, lastUrl: string | null) => ({
      key,
      programId: key,
      lastUrl,
      rect,
      z: 1,
      minimized: false,
      maximized: false,
      scrollTop: 0,
      title: "Ada's secret",
    });
    window.sessionStorage.setItem(
      windowStorageKey("u-1"),
      JSON.stringify({
        mode: "full",
        windows: [
          w("calendar", "/calendar"),
          // A captain program a plain member does not have: pruned.
          w("audit", "/captains/audit"),
          w("evil", "https://evil.example/"),
          w("folder:teams", null),
        ],
      }),
    );
    render(<Desktop {...props()} />);
    expect(frames().sort()).toEqual(["calendar", "folder:teams", "tasks"]);
    // A background frame is no landmark: found by its key.
    const background = document.querySelector('[data-window="calendar"]')!;
    expect(background.textContent).toContain("Click to open.");
    expect(document.body.textContent).not.toContain("Ada's secret");
  });
});

describe("held by a blocking questionnaire", () => {
  it("draws the form on top of an inert desktop with nothing live", () => {
    nav.pathname = "/questionnaires/act-1";
    render(<Desktop {...props({ mode: "held" })} />);
    // Named by the form's own heading.
    const layer = screen.getByRole("dialog", { name: "The page" });
    expect(layer.textContent).toContain("The page");
    expect(document.getElementById("os-desktop")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(frames()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeTruthy();
  });

  it("switches to the held picture at once when a page says so mid-session", () => {
    nav.pathname = "/questionnaires/act-1";
    render(
      <Desktop {...props()}>
        <HeldScreen />
        <h1>The form</h1>
      </Desktop>,
    );
    expect(screen.getByRole("dialog", { name: "The form" })).toBeTruthy();
    expect(document.getElementById("os-desktop")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(frames()).toEqual([]);
  });

  it("does not refresh when the layout already drew the held desktop", () => {
    nav.pathname = "/questionnaires/act-1";
    render(
      <Desktop {...props({ mode: "held" })}>
        <HeldScreen />
        <h1>The form</h1>
      </Desktop>,
    );
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});

describe("back and forward", () => {
  it("hides a page restored from the router's cache until the gate ran again", async () => {
    render(<Desktop {...props()} />);
    // What the window showed while the refresh (the gate) was running.
    const during: { hidden?: unknown; status?: string | null } = {};
    nav.refresh.mockImplementation(() => {
      during.hidden = document.getElementById("os-window-content")?.hidden;
      during.status = screen.queryByRole("status")?.textContent;
    });
    expect(document.getElementById("os-window-content")?.hidden).toBe(false);
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(during).toEqual({ hidden: true, status: "Checking…" });
    // The refresh done, the page shows again.
    expect(document.getElementById("os-window-content")?.hidden).toBe(false);
  });
});

describe("unsaved input in the live window", () => {
  function Dirty({ href }: { href: string }) {
    useWindowDirty(true, "Unsaved. Leave?");
    return (
      <>
        <h1>Editor</h1>
        <a href={href}>Go</a>
      </>
    );
  }
  const click = (link: HTMLElement) => {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(event);
    return event;
  };

  it("asks before a link inside it goes to another page, even in the same window", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    nav.pathname = "/profile";
    window.history.replaceState(null, "", "/profile");
    render(
      <Desktop {...props()}>
        <Dirty href="/profile/edit" />
      </Desktop>,
    );
    const event = click(screen.getByRole("link", { name: "Go" }));
    expect(confirm).toHaveBeenCalledWith("Unsaved. Leave?");
    expect(event.defaultPrevented).toBe(true);
    confirm.mockRestore();
  });

  it("lets a link to a place on the same page, or a new tab, go unasked", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    nav.pathname = "/profile";
    window.history.replaceState(null, "", "/profile");
    render(
      <Desktop {...props()}>
        <Dirty href="/profile#safety" />
      </Desktop>,
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect(click(link).defaultPrevented).toBe(false);
    // jsdom cannot open a new tab; the desktop has had its say by now.
    link.addEventListener("click", (e) => e.preventDefault());
    link.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      }),
    );
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
