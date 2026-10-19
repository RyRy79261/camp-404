import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import {
  INITIAL_WM,
  topWindow,
  type WmState,
} from "@camp404/os/window-manager";
import { ViewerRank } from "@camp404/types";
import { desktopFolderKey } from "@camp404/types/desktop-keys";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";
import {
  FIRST_VIEWPORT,
  STALE_AFTER_MS,
  accessChanged,
  backForwardCheck,
  decide,
  gateRedirected,
  initialWindows,
  isHistoryMove,
  isStaleReturn,
  livePage,
  liveWindowMissing,
  manifestChanged,
  pageSize,
  phoneBackFrom,
  reduceWindows,
  refusedPageRefresh,
  restoreActions,
  step,
  type DesktopContext,
  type Effect,
} from "../desktop-controller";
import { allowedWindowPrograms } from "../desktop-items";

// The desktop controller with no browser: an event and a snapshot of the
// window stack in, the window stack and the effects the shell runs out. The
// full renders (desktop-shell.test.tsx and the rest) keep what only a DOM
// shows: frames, the taskbar, copies, focus and the a11y tree.

const VP = { width: 1440, height: 816 };

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

function ctx(over: Partial<DesktopContext> = {}): DesktopContext {
  return {
    liveKey: null,
    viewport: VP,
    preOpened: null,
    base: "https://camp-404.test/tasks",
    onPhone: () => false,
    mayLeave: () => true,
    ...over,
  };
}

/** The desktop as it is after these addresses were opened, in order. */
function opened(...urls: string[]): WmState<string> {
  let state: WmState<string> = INITIAL_WM;
  for (const url of urls) {
    const page = livePage(url)!;
    state = reduceWindows(state, {
      type: "openPage",
      id: page.instanceKey,
      url,
      program: page.programId,
      size: pageSize(page.programId, VP),
      viewport: VP,
    });
  }
  return state;
}

const kinds = (effects: Effect[]) => effects.map((e) => e.kind);
const ids = (state: WmState<string>) => state.windows.map((w) => w.id);
const win = (state: WmState<string>, id: string) =>
  state.windows.find((w) => w.id === id);

describe("the URL is the focused window", () => {
  it("opens the page's window on the server's first paint, but never for a held member", () => {
    const page = livePage("/tasks");
    expect(ids(initialWindows(INITIAL_WM, page, "/tasks", false))).toEqual([
      "tasks",
    ]);
    expect(ids(initialWindows(INITIAL_WM, page, "/tasks", true))).toEqual([]);
    expect(livePage("/")).toBeNull();
  });

  it("opens the live window when it is missing, unless the member just closed it", () => {
    const page = livePage("/tasks");
    const state = INITIAL_WM;
    expect(liveWindowMissing({ state, page, held: false, closing: null })).toBe(
      true,
    );
    expect(
      liveWindowMissing({ state, page, held: false, closing: "tasks" }),
    ).toBe(false);
    expect(liveWindowMissing({ state, page, held: true, closing: null })).toBe(
      false,
    );
    expect(
      liveWindowMissing({
        state: opened("/tasks"),
        page,
        held: false,
        closing: null,
      }),
    ).toBe(false);
  });

  it("closing the live window replaces the address with the desktop and forgets its draft", () => {
    const out = step(
      opened("/tasks"),
      { type: "close", id: "tasks" },
      ctx({ liveKey: "tasks" }),
    );
    expect(ids(out.state)).toEqual([]);
    expect(out.effects).toEqual([
      { kind: "dropCopy", id: "tasks" },
      { kind: "forgetDrafts", id: "tasks" },
      { kind: "closing", id: "tasks" },
      { kind: "resume", key: null },
      { kind: "focusIconAfter", key: "tasks" },
      { kind: "replace", href: "/" },
    ]);
    expect(kinds(out.effects)).not.toContain("push");
  });

  it("closing hands the address to the next page window down, skipping folders and minimised ones", () => {
    let state = opened("/calendar/m-1/minutes", "/inventory", "/tasks");
    state = reduceWindows(state, { type: "minimize", id: "inventory" });
    state = reduceWindows(state, {
      type: "open",
      id: desktopFolderKey("kitchen"),
      size: { w: 440, h: 180 },
      viewport: VP,
    });
    state = reduceWindows(state, { type: "focus", id: "tasks" });
    const out = step(
      state,
      { type: "close", id: "tasks" },
      ctx({ liveKey: "tasks" }),
    );
    expect(out.effects).toContainEqual({
      kind: "replace",
      href: "/calendar/m-1/minutes",
    });
    expect(out.effects).toContainEqual({ kind: "resume", key: "minutes:m-1" });
    expect(out.effects).toContainEqual({ kind: "focusIconAfter", key: null });
  });

  it("closing a background window leaves the address alone and moves focus on", () => {
    const out = step(
      opened("/inventory", "/tasks"),
      { type: "close", id: "inventory" },
      ctx({ liveKey: "tasks" }),
    );
    expect(ids(out.state)).toEqual(["tasks"]);
    expect(kinds(out.effects)).toEqual([
      "dropCopy",
      "forgetDrafts",
      "focusAfterClose",
    ]);
  });

  it("minimising the live window replaces the address, copies it first, and keeps the window", () => {
    const out = step(
      opened("/tasks"),
      { type: "minimize", id: "tasks" },
      ctx({ liveKey: "tasks" }),
    );
    expect(win(out.state, "tasks")?.minimized).toBe(true);
    expect(out.effects).toEqual([
      { kind: "capture" },
      { kind: "resume", key: null },
      { kind: "replace", href: "/" },
      { kind: "focusTask", id: "tasks" },
    ]);
  });

  it("the Terminal's exit closes the live window only if its page may go", () => {
    const state = opened("/terminal");
    const asked = vi.fn(() => false);
    expect(
      step(
        state,
        { type: "closeLive" },
        ctx({ liveKey: "terminal", mayLeave: asked }),
      ).effects,
    ).toEqual([]);
    expect(asked).toHaveBeenCalledWith("terminal");
    expect(
      ids(
        step(state, { type: "closeLive" }, ctx({ liveKey: "terminal" })).state,
      ),
    ).toEqual([]);
    expect(step(state, { type: "closeLive" }, ctx()).effects).toEqual([]);
  });
});

describe("going to a program", () => {
  it("opens a program not yet open at the click, blinking, before its page arrives", () => {
    const out = step(
      opened("/tasks"),
      { type: "openHref", href: "/inventory" },
      ctx({ liveKey: "tasks" }),
    );
    expect(ids(out.state)).toEqual(["tasks", "inventory"]);
    expect(topWindow(out.state)?.id).toBe("inventory");
    expect(out.effects).toEqual([
      { kind: "capture" },
      { kind: "resume", key: null },
      { kind: "sentTo", path: "/inventory" },
      { kind: "pending", key: "inventory" },
      { kind: "preOpened", key: "inventory" },
      { kind: "push", href: "/inventory" },
    ]);
  });

  it("opens nothing ahead of the page on a phone, which shows one window", () => {
    const out = step(
      opened("/tasks"),
      { type: "openHref", href: "/inventory" },
      ctx({ liveKey: "tasks", onPhone: () => true }),
    );
    expect(ids(out.state)).toEqual(["tasks"]);
    expect(out.effects).toContainEqual({ kind: "push", href: "/inventory" });
    expect(kinds(out.effects)).not.toContain("preOpened");
  });

  it("brings an open program back where its window was left, and its scroll with it", () => {
    const state = opened("/inventory/item-7", "/tasks");
    const out = step(
      state,
      { type: "openHref", href: "/inventory" },
      ctx({ liveKey: "tasks" }),
    );
    expect(topWindow(out.state)?.id).toBe("inventory");
    expect(out.effects).toContainEqual({ kind: "resume", key: "inventory" });
    expect(out.effects).toContainEqual({
      kind: "push",
      href: "/inventory/item-7",
    });
  });

  it("follows a shortcut's own filter instead of where the window was left", () => {
    const state = opened("/tasks?team=power", "/inventory");
    const out = step(
      state,
      { type: "openHref", href: "/tasks?team=kitchen" },
      ctx({ liveKey: "inventory" }),
    );
    expect(out.effects).toContainEqual({
      kind: "push",
      href: "/tasks?team=kitchen",
    });
  });

  it("only raises the live window when its own program is opened again", () => {
    const out = step(
      opened("/tasks"),
      { type: "openHref", href: "/tasks" },
      ctx({ liveKey: "tasks" }),
    );
    expect(out.effects).toEqual([]);
    expect(
      decide(
        opened("/tasks"),
        { type: "openHref", href: "/tasks" },
        ctx({ liveKey: "tasks" }),
      ).effects,
    ).toEqual([{ kind: "wm", action: { type: "focus", id: "tasks" } }]);
  });

  it("ignores an address that is no console program", () => {
    expect(
      decide(
        opened("/tasks"),
        { type: "openHref", href: "https://evil.example/" },
        ctx(),
      ).effects,
    ).toEqual([]);
  });

  it("does nothing at all when the live page has unsaved input and the member stays", () => {
    const mayLeave = vi.fn(() => false);
    const out = step(
      opened("/tasks"),
      { type: "openHref", href: "/inventory" },
      ctx({ liveKey: "tasks", mayLeave }),
    );
    expect(out.refused).toBe(true);
    expect(out.effects).toEqual([]);
    expect(ids(out.state)).toEqual(["tasks"]);
    expect(mayLeave).toHaveBeenCalledWith("tasks");
  });

  it("closes the window a first click opened ahead of its page when a second click wins", () => {
    let state = opened("/tasks");
    state = step(
      state,
      { type: "openHref", href: "/inventory" },
      ctx({ liveKey: "tasks" }),
    ).state;
    const out = step(
      state,
      { type: "openHref", href: "/calendar" },
      ctx({ liveKey: "tasks", preOpened: "inventory" }),
    );
    expect(ids(out.state)).toEqual(["tasks", "calendar"]);
    expect(out.effects).toContainEqual({ kind: "preOpened", key: "calendar" });
  });

  it("settles a window opened ahead of its page: kept once the page is in it, gone if it never came", () => {
    const state = opened("/tasks", "/inventory");
    const pre = ctx({ liveKey: "tasks", preOpened: "inventory" });
    expect(
      step(state, { type: "settlePreOpened", navigating: true }, pre).effects,
    ).toEqual([]);
    const lost = step(
      state,
      { type: "settlePreOpened", navigating: false },
      pre,
    );
    expect(ids(lost.state)).toEqual(["tasks"]);
    expect(lost.effects).toEqual([{ kind: "preOpened", key: null }]);
    const arrived = step(
      state,
      { type: "settlePreOpened", navigating: true },
      ctx({ liveKey: "inventory", preOpened: "inventory" }),
    );
    expect(ids(arrived.state)).toEqual(["tasks", "inventory"]);
    expect(arrived.effects).toEqual([{ kind: "preOpened", key: null }]);
    expect(
      step(state, { type: "settlePreOpened", navigating: false }, ctx())
        .effects,
    ).toEqual([]);
  });

  it("opens a search result at its exact address, asking first when it replaces the live page", () => {
    const state = opened("/inventory/item-7");
    const mayLeave = vi.fn(() => false);
    const refused = step(
      state,
      { type: "openSearchEntry", href: "/inventory/item-9" },
      ctx({ liveKey: "inventory", mayLeave }),
    );
    expect(refused.refused).toBe(true);
    expect(refused.effects).toEqual([]);
    const out = step(
      state,
      { type: "openSearchEntry", href: "/inventory/item-9" },
      ctx({ liveKey: "inventory" }),
    );
    expect(out.effects).toContainEqual({
      kind: "push",
      href: "/inventory/item-9",
    });
    expect(
      step(state, { type: "openSearchEntry", href: "/somewhere-else" }, ctx())
        .effects,
    ).toEqual([{ kind: "push", href: "/somewhere-else" }]);
  });

  it("says where it sent the member as a path, so a gate's redirect can be told from it", () => {
    const out = step(
      INITIAL_WM,
      {
        type: "navigate",
        to: "/tasks?team=kitchen",
        key: "tasks",
        resume: false,
      },
      ctx(),
    );
    expect(out.effects).toContainEqual({ kind: "sentTo", path: "/tasks" });
  });
});

describe("raising windows", () => {
  it("raises a folder at once, and a page window by going to its address", () => {
    const folder = desktopFolderKey("kitchen");
    let state = opened("/inventory", "/tasks");
    state = reduceWindows(state, {
      type: "open",
      id: folder,
      size: { w: 440, h: 180 },
      viewport: VP,
    });
    const c = ctx({ liveKey: "tasks" });
    expect(
      decide(state, { type: "focusWindow", id: folder }, c).effects,
    ).toEqual([{ kind: "wm", action: { type: "focus", id: folder } }]);
    const page = step(state, { type: "focusWindow", id: "inventory" }, c);
    expect(page.effects).toContainEqual({ kind: "push", href: "/inventory" });
    expect(page.effects).toContainEqual({ kind: "resume", key: "inventory" });
    expect(topWindow(page.state)?.id).toBe("inventory");
  });

  it("a taskbar press minimises the window on top and raises any other", () => {
    const state = opened("/inventory", "/tasks");
    const c = ctx({ liveKey: "tasks" });
    const down = step(state, { type: "taskbarToggle", id: "tasks" }, c);
    expect(win(down.state, "tasks")?.minimized).toBe(true);
    expect(down.effects).toContainEqual({
      kind: "replace",
      href: "/inventory",
    });
    const up = step(state, { type: "taskbarToggle", id: "inventory" }, c);
    expect(up.effects).toContainEqual({ kind: "push", href: "/inventory" });
    const minimised = reduceWindows(state, { type: "minimize", id: "tasks" });
    expect(
      step(minimised, { type: "taskbarToggle", id: "tasks" }, c).effects,
    ).toEqual([]);
    expect(
      step(state, { type: "taskbarToggle", id: "gone" }, c).effects,
    ).toEqual([]);
  });

  it("opens a folder at its own size", () => {
    const teams = desktopFolderKey("teams");
    const out = step(INITIAL_WM, { type: "openFolder", key: teams }, ctx());
    expect(win(out.state, teams)).toMatchObject({ w: 620, h: 600, x: 308 });
  });
});

describe("Show desktop, Home and Tidy windows", () => {
  it("Show desktop puts every window down and replaces the address with the desktop", () => {
    const state = opened("/inventory", "/tasks");
    const out = step(state, { type: "showDesktop" }, ctx({ liveKey: "tasks" }));
    expect(out.state.windows.every((w) => w.minimized)).toBe(true);
    expect(out.effects).toEqual([
      { kind: "capture" },
      { kind: "resume", key: null },
      { kind: "replace", href: "/" },
    ]);
  });

  it("Show desktop from the desktop's own page changes no address", () => {
    const out = step(opened("/inventory"), { type: "showDesktop" }, ctx());
    expect(out.state.windows.every((w) => w.minimized)).toBe(true);
    expect(out.effects).toEqual([]);
  });

  it("Home on a phone pushes the home screen, an entry of its own, and stays on a no", () => {
    const state = opened("/tasks");
    const out = step(state, { type: "goHome" }, ctx({ liveKey: "tasks" }));
    expect(out.refused).toBe(false);
    expect(win(out.state, "tasks")?.minimized).toBe(true);
    expect(out.effects).toEqual([
      { kind: "capture" },
      { kind: "resume", key: null },
      { kind: "pending", key: null },
      { kind: "push", href: "/" },
    ]);
    const no = step(
      state,
      { type: "goHome" },
      ctx({ liveKey: "tasks", mayLeave: () => false }),
    );
    expect(no.refused).toBe(true);
    expect(no.effects).toEqual([]);
    expect(win(no.state, "tasks")?.minimized).toBeFalsy();
  });

  it("Tidy windows: back to their opening size, cascaded in stacking order, none full screen", () => {
    let state = opened("/inventory", "/tasks");
    state = reduceWindows(state, { type: "toggleMaximize", id: "inventory" });
    state = reduceWindows(state, {
      type: "move",
      id: "tasks",
      x: 900,
      y: 400,
      viewport: VP,
    });
    const out = step(state, { type: "tidy" }, ctx());
    expect(win(out.state, "inventory")).toMatchObject({
      x: 308,
      y: 12,
      maximized: false,
    });
    expect(win(out.state, "tasks")).toMatchObject({
      x: 336,
      y: 40,
      maximized: false,
    });
    expect(ids(out.state)).toEqual(ids(state));
  });

  it("cascades each new window below the last, right of the icons", () => {
    const state = opened("/inventory", "/tasks", "/calendar");
    expect(state.windows.map((w) => [w.x, w.y])).toEqual([
      [308, 12],
      [336, 40],
      [364, 68],
    ]);
  });
});

describe("Back on a phone", () => {
  it("closes the window it left on a phone only, and only when the address moved", () => {
    const at = { liveKey: "tasks", url: "/tasks", now: "/inventory" };
    expect(phoneBackFrom({ phone: true, ...at })).toBe("tasks");
    expect(phoneBackFrom({ phone: false, ...at })).toBeNull();
    expect(phoneBackFrom({ phone: true, ...at, now: "/tasks" })).toBeNull();
    expect(phoneBackFrom({ phone: true, ...at, liveKey: null })).toBeNull();
  });

  it("closes it without asking and keeps its draft for when it is reopened", () => {
    const out = step(
      opened("/tasks", "/inventory"),
      { type: "phoneBack", from: "tasks" },
      ctx({ liveKey: "inventory" }),
    );
    expect(ids(out.state)).toEqual(["inventory"]);
    expect(out.effects).toEqual([{ kind: "dropCopy", id: "tasks" }]);
  });

  it("leaves the window be when Back landed on its own page again", () => {
    expect(
      step(
        opened("/tasks"),
        { type: "phoneBack", from: "tasks" },
        ctx({ liveKey: "tasks" }),
      ).effects,
    ).toEqual([]);
  });
});

describe("the stack kept for this tab", () => {
  it("puts the saved windows back around the live one, on top, and drops what the member may not open", () => {
    const manifest = buildProgramManifest(facts());
    const live = livePage("/tasks");
    const saved = opened("/inventory", "/captains/audit").windows;
    let state = initialWindows(INITIAL_WM, live, "/tasks", false);
    for (const action of restoreActions({
      saved,
      liveKey: "tasks",
      page: live,
      viewport: VP,
      allowed: allowedWindowPrograms(manifest, { cells: {}, items: [] }),
    })) {
      state = reduceWindows(state, action);
    }
    expect(ids(state)).toEqual(["inventory", "tasks"]);
    expect(topWindow(state)?.id).toBe("tasks");
  });

  it("gives a live page placed on the first guess the room a bigger screen has", () => {
    const live = livePage("/captains/camp-sheet");
    const state = initialWindows(
      INITIAL_WM,
      live,
      "/captains/camp-sheet",
      false,
    );
    expect(win(state, "camp-sheet")?.w).toBeLessThan(1404);
    const HD = { width: 1920, height: 996 };
    const [restore] = restoreActions({
      saved: [],
      liveKey: "camp-sheet",
      page: live,
      viewport: HD,
      allowed: [],
    });
    expect(win(reduceWindows(state, restore!), "camp-sheet")).toMatchObject({
      w: 1404,
      h: 875,
    });
  });
});

describe("a new manifest", () => {
  it("closes the captain's windows on a demotion, and forgets their drafts", () => {
    const captain = buildProgramManifest(
      facts({ rank: ViewerRank.enum.captain }),
    );
    const member = buildProgramManifest(facts());
    expect(member.version).not.toBe(captain.version);
    const state = opened("/calendar", "/captains/audit", "/tasks");
    const change = manifestChanged({
      state,
      manifest: member,
      layout: { cells: {}, items: [] },
      page: livePage("/tasks"),
      liveKey: "tasks",
    });
    expect(change.forget).toEqual(["audit"]);
    expect(ids(reduceWindows(state, change.prune))).toEqual([
      "calendar",
      "tasks",
    ]);
  });

  it("keeps the live page's window even when the manifest no longer lists it: its gate let it render", () => {
    const member = buildProgramManifest(facts());
    const state = opened("/captains/audit");
    const change = manifestChanged({
      state,
      manifest: member,
      layout: { cells: {}, items: [] },
      page: livePage("/captains/audit"),
      liveKey: "audit",
    });
    expect(change.forget).toEqual([]);
    expect(ids(reduceWindows(state, change.prune))).toEqual(["audit"]);
  });

  it("drops the member's shortcuts to programs they lost", () => {
    const member = buildProgramManifest(facts());
    const change = manifestChanged({
      state: INITIAL_WM,
      manifest: member,
      layout: {
        cells: {},
        items: [
          { kind: "shortcut", id: "sc-1", target: "audit" },
          { kind: "shortcut", id: "sc-2", target: "tasks" },
        ],
      },
      page: null,
      liveKey: null,
    });
    expect(change.layout.items).toEqual([
      { kind: "shortcut", id: "sc-2", target: "tasks" },
    ]);
  });
});

describe("when the desktop asks the server again", () => {
  it("Back or Forward: refresh once the router is there, wait while it is not, show once the refresh ran", () => {
    expect(
      backForwardCheck({
        started: false,
        refreshing: false,
        url: "/a",
        poppedTo: "/a",
      }),
    ).toBe("start");
    expect(
      backForwardCheck({
        started: false,
        refreshing: false,
        url: "/b",
        poppedTo: "/a",
      }),
    ).toBe("wait");
    expect(
      backForwardCheck({
        started: true,
        refreshing: true,
        url: "/a",
        poppedTo: "/a",
      }),
    ).toBe("busy");
    expect(
      backForwardCheck({
        started: true,
        refreshing: false,
        url: "/a",
        poppedTo: "/a",
      }),
    ).toBe("done");
  });

  it("a fragment link's popstate is no move through history", () => {
    expect(isHistoryMove("/tasks", "/tasks")).toBe(false);
    expect(isHistoryMove("/inventory", "/tasks")).toBe(true);
  });

  it("refreshes a tab shown again after five minutes or more, not sooner, and not on a first show", () => {
    const hidden = 1_000_000;
    expect(isStaleReturn(hidden, hidden + STALE_AFTER_MS - 1)).toBe(false);
    expect(isStaleReturn(hidden, hidden + STALE_AFTER_MS)).toBe(true);
    expect(isStaleReturn(0, hidden + STALE_AFTER_MS)).toBe(false);
  });

  it("refreshes when a gate sent the member somewhere the desktop did not, unless held", () => {
    expect(gateRedirected("/captains/audit", "/", false)).toBe(true);
    expect(gateRedirected("/captains/audit", "/captains/audit", false)).toBe(
      false,
    );
    expect(gateRedirected("/captains/audit", "/", true)).toBe(false);
    expect(gateRedirected(null, "/", false)).toBe(false);
  });

  it("refreshes once per address for a page the gate refused", () => {
    expect(refusedPageRefresh(true, null, "/captains/audit")).toBe(true);
    expect(refusedPageRefresh(true, "/captains/audit", "/captains/audit")).toBe(
      false,
    );
    expect(refusedPageRefresh(false, null, "/captains/audit")).toBe(false);
  });

  it("refreshes when the server's access version is not the one drawn", () => {
    expect(accessChanged("v2", "v1")).toBe(true);
    expect(accessChanged("v1", "v1")).toBe(false);
    expect(accessChanged(null, "v1")).toBe(true);
  });
});

describe("how big a page's window opens", () => {
  // The desktop under the bars (84 px of a screen's height): what the shell
  // measures and passes in.
  const HD = { width: 1920, height: 996 }; // a 1920 x 1080 screen
  const QHD = { width: 2560, height: 1356 }; // a 2560 x 1440 screen
  const SMALL = { width: 1280, height: 636 }; // a 1280 x 720 screen

  it("grows a wide program with a big screen, right of the icons", () => {
    // The room right of the icons: 1920 - 308 - 52 = 1560 wide, 972 tall.
    expect(pageSize("camp-sheet", HD)).toEqual({ w: 1404, h: 875 });
    expect(pageSize("roster", HD)).toEqual({ w: 1248, h: 875 });
    expect(pageSize("audit", HD)).toEqual({ w: 1092, h: 875 });
    // 2560 - 308 - 52 = 2200 wide, 1332 tall.
    expect(pageSize("camp-sheet", QHD)).toEqual({ w: 1980, h: 1199 });
    expect(pageSize("roster", QHD)).toEqual({ w: 1760, h: 1199 });
    expect(pageSize("audit", QHD)).toEqual({ w: 1540, h: 1199 });
  });

  it("never opens a wide program smaller than its own size", () => {
    expect(pageSize("camp-sheet", SMALL)).toEqual({ w: 1120, h: 800 });
    expect(pageSize("roster", SMALL)).toEqual({ w: 1040, h: 660 });
    expect(pageSize("audit", SMALL)).toEqual({ w: 880, h: 600 });
  });

  it("keeps small programs and reading pages at their own size", () => {
    for (const vp of [SMALL, HD, QHD, FIRST_VIEWPORT]) {
      expect(pageSize("terminal", vp)).toEqual({ w: 640, h: 420 });
      expect(pageSize("inkblot", vp)).toEqual({ w: 700, h: 440 });
      expect(pageSize("guide-chapter", vp)).toEqual({ w: 880, h: 600 });
      expect(pageSize("inbox", vp)).toEqual({ w: 720, h: 520 });
      expect(pageSize(undefined, vp)).toEqual({ w: 720, h: 520 });
    }
  });
});

describe("the controller's boundary", () => {
  // No React, no DOM and nothing from next/*, through every module it
  // imports at run time (type-only imports are erased).
  const here = path.resolve(__dirname, "..");
  const files = [
    path.join(here, "desktop-controller.ts"),
    path.join(here, "desktop-items.ts"),
    path.resolve(here, "../../lib/program-routes.ts"),
  ];
  const runtimeImports = (file: string) =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /^import\s+(?!type\s)[\s\S]*?from\s+"([^"]+)";/gm,
      ),
    ].map((m) => m[1]!);

  it.each(files)("%s imports nothing that draws or routes", (file) => {
    for (const spec of runtimeImports(file)) {
      expect(spec).not.toMatch(/^(react|react-dom|next)(\/|$)/);
      expect(spec).not.toBe("@camp404/os");
      expect(spec).not.toMatch(/\.tsx$|desktop-shell/);
    }
  });

  it("reads no browser global", () => {
    const source = readFileSync(files[0]!, "utf8").replace(
      /\/\/.*$|\/\*[\s\S]*?\*\//gm,
      "",
    );
    expect(source).not.toMatch(
      /\b(window|document|globalThis)\s*\.|\b(sessionStorage|localStorage|matchMedia|requestAnimationFrame|HTMLElement)\b/,
    );
  });
});
