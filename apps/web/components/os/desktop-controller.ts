import {
  CASCADE_STEP,
  MIN_SIZE,
  topWindow,
  wmReducer,
  type OsWindow,
  type Viewport,
  type WmAction,
  type WmState,
} from "@camp404/os/window-manager";
import { pruneLayout, type DesktopLayout } from "@camp404/os/icon-grid";
import { desktopFolderKey } from "@camp404/types/desktop-keys";
import type { ProgramManifest } from "@/lib/programs";
import {
  matchProgram,
  programSize,
  type OpeningSize,
  type ProgramMatch,
} from "@/lib/program-routes";
import {
  allowedWindowPrograms,
  desktopEntries,
  programIndex,
  windowProgram,
} from "./desktop-items";

// The desktop controller: the 404 OS desktop's window and routing policy as
// plain data, with no React, no DOM and nothing from next/*. THE URL IS THE
// FOCUSED WINDOW (desktop-shell.tsx): this module decides which window an
// address opens or raises, where a new window goes, what a close, a minimise,
// Home, Show desktop or a taskbar press does to the stack and the address,
// what a new manifest prunes, and when a Back, a stale tab, a gate redirect or
// a changed access version asks the server again.
//
// `decide(state, event, context)` answers an event with a plan: an ordered
// list of effects (`{ kind: "push", href }`, `{ kind: "wm", action }`, ...)
// that the shell runs, in order, with its router, refs and storage. The
// window stack itself moves only through `reduceWindows`, the shell's
// useReducer, so a plan's window changes queue behind any other dispatch in
// the same event exactly as before. `step` folds a plan's window changes
// into the state, for tests.
//
// What stays in the shell: drawing, refs, DOM reads (the live body, the
// copies, focus), browser storage, the access check's fetch, voice, the cats,
// the phone's sheets and the right-click menus.

/**
 * A window's size when it opens, before the member resizes it: the
 * prototype's sizes (_proto/programs.ts, its S, M, L and XL), which the owner
 * approved with the prototype on 2026-09-26. M is the default.
 */
const DEFAULT_SIZE = { w: 720, h: 520 };
/** A member's own folder. */
const FOLDER_SIZE = { w: 520, h: 340 };
/**
 * The camp's folders, each at the prototype's size: Teams opens tall, every
 * team's icon and the art piece pinned under them; Kitchen is one row.
 */
const CAMP_FOLDER_SIZE: Record<string, { w: number; h: number }> = {
  [desktopFolderKey("teams")]: { w: 620, h: 600 },
  [desktopFolderKey("kitchen")]: { w: 440, h: 180 },
  [desktopFolderKey("captains")]: { w: 560, h: 340 },
};
export function folderSize(key: string): { w: number; h: number } {
  return CAMP_FOLDER_SIZE[key] ?? FOLDER_SIZE;
}
/** The share of the room's height a growing page takes. */
const GROW_HEIGHT = 0.9;
/** A tab back after this long refreshes the desktop (an event, not a timer). */
export const STALE_AFTER_MS = 5 * 60_000;
/**
 * How long a Back or Forward waits for the router to reach the popped
 * address before it checks whatever the router shows.
 */
export const POP_SETTLE_MS = 1500;
/** A screen before it has been measured: the server's first paint. */
export const FIRST_VIEWPORT: Viewport = { width: 1280, height: 720 };

/**
 * Where windows open, and where "Tidy windows" starts its cascade: just
 * right of the icons' default columns (the prototype's), so the icons stay
 * in sight.
 */
const ICONS_EDGE = 308;
/**
 * What a new window leaves free at the right edge: the Today handle's 44 px
 * to aim at and a gap, so the handle never sits on a window's close button.
 */
const TODAY_ROOM = 52;

export type DesktopAction =
  | WmAction<string>
  | {
      /** The window for a page address: open it, or raise it. */
      type: "openPage";
      id: string;
      url: string;
      program: string;
      size: { w: number; h: number };
      viewport: Viewport;
    }
  | {
      /** Put back a stored stack around the window the URL shows. */
      type: "restore";
      saved: OsWindow<string>[];
      liveKey: string | null;
      viewport: Viewport;
      /** The live page's opening size, when nothing saved places it. */
      size?: { w: number; h: number };
    }
  | {
      /**
       * "Tidy windows" (the Start menu): every window on the desktop back to
       * its opening size, cascaded from the top left in its stacking order,
       * none maximised. Minimised windows stay down; the order, and so the
       * live window on top, does not change.
       */
      type: "tidy";
      viewport: Viewport;
    };

/**
 * The prototype's spot for the k-th window: right of the icons, cascading
 * from the top, cut to the room left (a screen with no room right of the
 * icons starts further left rather than push a window off it).
 */
function placeAt(
  k: number,
  size: { w: number; h: number },
  vp: Viewport,
): Pick<OsWindow<string>, "x" | "y" | "w" | "h"> {
  const room = vp.width - ICONS_EDGE - 36;
  const x0 =
    room >= Math.min(size.w, 640)
      ? ICONS_EDGE
      : Math.max(8, Math.min(vp.width - size.w - 40, ICONS_EDGE));
  const step = k % 6;
  const x = x0 + step * CASCADE_STEP;
  const y = 12 + step * CASCADE_STEP;
  return {
    x,
    y,
    w: Math.max(MIN_SIZE.w, Math.min(size.w, vp.width - x - TODAY_ROOM)),
    h: Math.max(MIN_SIZE.h, Math.min(size.h, vp.height - y - 12)),
  };
}

function tidy(state: WmState<string>, vp: Viewport): WmState<string> {
  const shown = state.windows
    .filter((w) => !w.minimized)
    .sort((a, b) => a.z - b.z);
  const place = new Map<string, OsWindow<string>>();
  shown.forEach((w, i) => {
    const size = w.lastUrl ? pageSize(w.program, vp) : folderSize(w.id);
    place.set(w.id, { ...w, ...placeAt(i, size, vp), maximized: false });
  });
  if (place.size === 0) return state;
  return {
    ...state,
    windows: state.windows.map((w) => place.get(w.id) ?? w),
  };
}

/**
 * A page's opening size on this screen: its own, else the default, grown to
 * its share of the room right of the icons when it grows.
 */
export function pageSize(
  program: string | undefined,
  vp: Viewport,
): { w: number; h: number } {
  const size: OpeningSize = (program && programSize(program)) || DEFAULT_SIZE;
  const grow = size.grow;
  if (!grow) return { w: size.w, h: size.h };
  const room = {
    w: vp.width - ICONS_EDGE - TODAY_ROOM,
    h: vp.height - 24,
  };
  return {
    w: Math.max(size.w, Math.round(room.w * grow)),
    h: Math.max(size.h, Math.round(room.h * GROW_HEIGHT)),
  };
}

/** A window that has just opened goes where the prototype puts it. */
function placeNew(
  before: WmState<string>,
  after: WmState<string>,
  id: string,
  size: { w: number; h: number },
  vp: Viewport,
): WmState<string> {
  if (before.windows.some((w) => w.id === id)) return after;
  const shown = before.windows.filter((w) => !w.minimized).length;
  const at = placeAt(shown, size, vp);
  return {
    ...after,
    windows: after.windows.map((w) => (w.id === id ? { ...w, ...at } : w)),
  };
}

/** The window stack's reducer: the engine's, plus the desktop's own moves. */
export function reduceWindows(
  state: WmState<string>,
  action: DesktopAction,
): WmState<string> {
  if (action.type === "tidy") return tidy(state, action.viewport);
  if (action.type === "openPage") {
    const next = wmReducer(state, {
      type: "upsertUrl",
      id: action.id,
      url: action.url,
      program: action.program,
      size: action.size,
      viewport: action.viewport,
    });
    return placeNew(state, next, action.id, action.size, action.viewport);
  }
  if (action.type === "open") {
    const next = wmReducer(state, action);
    return placeNew(state, next, action.id, action.size, action.viewport);
  }
  if (action.type === "restore") {
    const live = state.windows.find((w) => w.id === action.liveKey);
    const savedLive = action.saved.find((w) => w.id === action.liveKey);
    const kept = state.windows.filter(
      (w) =>
        w.id !== action.liveKey && !action.saved.some((s) => s.id === w.id),
    );
    const others = [
      ...action.saved.filter((w) => w.id !== action.liveKey),
      ...kept,
    ];
    const topZ = others.reduce((z, w) => Math.max(z, w.z), 0);
    const windows = [...others];
    if (live) {
      // A page opened fresh was placed before the screen was measured (on
      // FIRST_VIEWPORT, so the server and the browser agree). A bigger screen
      // gives it the room its own size asks for, or a wide page stays cut to
      // a small one's; it never shrinks here (hydrate fits it to the screen).
      const fresh =
        !savedLive && action.size
          ? placeAt(
              others.filter((w) => !w.minimized).length,
              action.size,
              action.viewport,
            )
          : null;
      windows.push({
        ...live,
        ...(fresh && {
          w: Math.max(live.w, fresh.w),
          h: Math.max(live.h, fresh.h),
        }),
        ...(savedLive && {
          x: savedLive.x,
          y: savedLive.y,
          w: savedLive.w,
          h: savedLive.h,
          maximized: savedLive.maximized,
        }),
        minimized: false,
        z: topZ + 1,
      });
    }
    return wmReducer(state, {
      type: "hydrate",
      saved: { windows, topZ: topZ + 1 },
      viewport: action.viewport,
    });
  }
  return wmReducer(state, action);
}

/** The highest page window other than `except` that is on the desktop. */
export function nextPageWindow(
  state: WmState<string>,
  except: string,
): OsWindow<string> | undefined {
  let best: OsWindow<string> | undefined;
  for (const w of state.windows) {
    if (w.id === except || w.minimized || !w.lastUrl) continue;
    if (!best || w.z > best.z) best = w;
  }
  return best;
}

// --- The live page's window ----------------------------------------------------

/** The program page an address shows, or null for the desktop's own page. */
export function livePage(pathname: string): ProgramMatch | null {
  const match = matchProgram(pathname);
  return match && match.programId !== "desktop" ? match : null;
}

/** Open, or raise, the window of the page the address shows. */
export function openPageAction(
  page: ProgramMatch | null,
  url: string,
  vp: Viewport,
): DesktopAction | null {
  return page
    ? {
        type: "openPage",
        id: page.instanceKey,
        url,
        program: windowProgram(page.programId, page.instanceKey),
        size: pageSize(page.programId, vp),
        viewport: vp,
      }
    : null;
}

/** The window stack the server's first paint draws for an address. */
export function initialWindows(
  initial: WmState<string>,
  page: ProgramMatch | null,
  url: string,
  held: boolean,
): WmState<string> {
  const open = openPageAction(page, url, FIRST_VIEWPORT);
  return open && !held ? reduceWindows(initial, open) : initial;
}

/**
 * The live page has no window (and was not just closed by the member, whose
 * replace has not landed yet): the address opens it.
 */
export function liveWindowMissing(input: {
  state: WmState<string>;
  page: ProgramMatch | null;
  held: boolean;
  closing: string | null;
}): boolean {
  const { state, page, held, closing } = input;
  return (
    !!page &&
    !held &&
    page.instanceKey !== closing &&
    !state.windows.some((w) => w.id === page.instanceKey)
  );
}

/**
 * Put this tab's kept stack back around the live window, then close what the
 * member may not open (the live page's own program stays: its gate let it
 * render).
 */
export function restoreActions(input: {
  saved: OsWindow<string>[];
  liveKey: string | null;
  page: ProgramMatch | null;
  viewport: Viewport;
  allowed: Iterable<string>;
}): DesktopAction[] {
  const { saved, liveKey, page, viewport } = input;
  return [
    {
      type: "restore",
      saved,
      liveKey,
      viewport,
      size: page ? pageSize(page.programId, viewport) : undefined,
    },
    {
      type: "pruneTo",
      allowed: [
        ...input.allowed,
        ...(liveKey && page ? [windowProgram(page.programId, liveKey)] : []),
      ],
    },
  ];
}

// --- Events and their plans ------------------------------------------------------

export type Effect =
  /** A change to the window stack, through reduceWindows. */
  | { kind: "wm"; action: DesktopAction }
  /** Copy the live window's body before it stops being the live one. */
  | { kind: "capture" }
  /** Go to an address, in a transition (the pending blink). */
  | { kind: "push"; href: string }
  /** Replace the address (a close or a minimise of the live window). */
  | { kind: "replace"; href: string }
  /** Ask the server for this page and the manifest again. */
  | { kind: "refresh" }
  /** The window whose scroll comes back when its page arrives. */
  | { kind: "resume"; key: string | null }
  /** The window that blinks while the navigation runs. */
  | { kind: "pending"; key: string | null }
  /** Where the desktop sent the member, to tell a gate's redirect from it. */
  | { kind: "sentTo"; path: string }
  /** The window opened ahead of its page, until the page arrives in it. */
  | { kind: "preOpened"; key: string | null }
  /** The live window the member closed: it must not open again meanwhile. */
  | { kind: "closing"; id: string }
  /** The icon that takes focus when the desktop arrives with no window. */
  | { kind: "focusIconAfter"; key: string | null }
  /** Drop a window's last-seen copy and kept scroll. */
  | { kind: "dropCopy"; id: string }
  /** Drop a window's kept draft, in memory and in this tab's storage. */
  | { kind: "forgetDrafts"; id: string }
  /** After a background window closes: focus the next one, or its icon. */
  | { kind: "focusAfterClose"; id: string }
  /** After a minimise: focus the window's taskbar button. */
  | { kind: "focusTask"; id: string };

export type DesktopEvent =
  /** The one way the desktop itself switches windows: go to an address. */
  | { type: "navigate"; to: string; key: string | null; resume: boolean }
  /** A program's address: raise its window if open, else go there. */
  | { type: "openHref"; href: string }
  /** A search result: always its exact address, in its program's window. */
  | { type: "openSearchEntry"; href: string }
  | { type: "openFolder"; key: string }
  /** Raise a window: a folder at once, a page by going to its address. */
  | { type: "focusWindow"; id: string }
  /**
   * `asked`: the window's own button already asked the leave guard (the
   * frame's close and minimise), so it is not asked twice.
   */
  | { type: "close"; id: string; asked?: boolean }
  /** A page asked to close its own window (the Terminal's exit). */
  | { type: "closeLive" }
  | { type: "minimize"; id: string; asked?: boolean }
  /** Minimise every window; the address goes to the desktop. */
  | { type: "showDesktop" }
  /** Home on a phone: every window put away, the address the home screen. */
  | { type: "goHome" }
  | { type: "taskbarToggle"; id: string }
  | { type: "tidy" }
  /** A Back on a phone landed on another window's page: close the one left. */
  | { type: "phoneBack"; from: string }
  /** The navigation settled (or the page arrived): keep or drop a pre-open. */
  | { type: "settlePreOpened"; navigating: boolean };

export interface DesktopContext {
  /** The window the address shows, or null on the desktop's own page. */
  liveKey: string | null;
  viewport: Viewport;
  /** The window a click opened before its page arrived, if any. */
  preOpened: string | null;
  /** Where a relative address resolves (the page's own address). */
  base: string;
  /** The phone layout, asked only when an event needs it. */
  onPhone: () => boolean;
  /** The leave guard: may this window's page go (it asks when dirty)? */
  mayLeave: (key: string) => boolean;
}

export interface Plan {
  effects: Effect[];
  /** The leave guard said no: nothing changed. */
  refused?: boolean;
}

const NOTHING: Plan = { effects: [] };
const REFUSED: Plan = { effects: [], refused: true };

function wm(action: DesktopAction): Effect {
  return { kind: "wm", action };
}

/** Answer one event with the effects the shell runs, in order. */
export function decide(
  state: WmState<string>,
  event: DesktopEvent,
  ctx: DesktopContext,
): Plan {
  const { liveKey } = ctx;
  switch (event.type) {
    case "navigate": {
      const { to, key, resume } = event;
      if (liveKey && key !== liveKey && !ctx.mayLeave(liveKey)) return REFUSED;
      const effects: Effect[] = [
        { kind: "capture" },
        { kind: "resume", key: resume ? key : null },
        { kind: "sentTo", path: new URL(to, ctx.base).pathname },
        { kind: "pending", key },
      ];
      // Instant feedback: a program not yet open gets its window (and its
      // taskbar button) at once, blinking "Loading…" until the page lands in
      // it; the server may take a second. Not on a phone, which shows one
      // window, the page. The window is the one the page would open anyway
      // (same id, size and place), so the arrival only fills it.
      const m = key ? matchProgram(to) : null;
      // A second click before the first page came: the first window it
      // opened ahead of its page goes.
      const earlier = ctx.preOpened;
      if (earlier && earlier !== key) {
        effects.push(
          { kind: "preOpened", key: null },
          wm({ type: "close", id: earlier }),
        );
      }
      const already =
        key && key !== earlier
          ? state.windows.find((w) => w.id === key)
          : undefined;
      if (already && key !== liveKey) {
        // An open window comes to the front at once, with its last-seen
        // copy, blinking until its page arrives.
        effects.push(wm({ type: "focus", id: already.id }));
      } else if (
        key &&
        m &&
        m.programId !== "desktop" &&
        !ctx.onPhone() &&
        !already
      ) {
        effects.push(
          { kind: "preOpened", key },
          wm({
            type: "openPage",
            id: key,
            url: to,
            program: windowProgram(m.programId, key),
            size: pageSize(m.programId, ctx.viewport),
            viewport: ctx.viewport,
          }),
        );
      }
      effects.push({ kind: "push", href: to });
      return { effects };
    }
    case "openHref": {
      const m = matchProgram(event.href);
      if (!m) return NOTHING;
      if (m.instanceKey === liveKey) {
        return { effects: [wm({ type: "focus", id: m.instanceKey })] };
      }
      const open = state.windows.find((w) => w.id === m.instanceKey);
      // A shortcut that names its own filter (a team folder's "Kitchen
      // tasks", /tasks?team=kitchen) goes there; a plain program comes back
      // where its window was left.
      const filtered = event.href.includes("?");
      return decide(
        state,
        {
          type: "navigate",
          to: filtered ? event.href : (open?.lastUrl ?? event.href),
          key: m.instanceKey,
          resume: !!open,
        },
        ctx,
      );
    }
    case "openSearchEntry": {
      // openHref would send a plain address back to where an open window
      // was left, so a hit on /inventory/<id> would land on another item
      // while Inventory is already open.
      const m = matchProgram(event.href);
      // navigate asks the leave guard only when the window changes; a
      // result in the live window replaces its page, so ask here too.
      if (liveKey && m?.instanceKey === liveKey && !ctx.mayLeave(liveKey)) {
        return REFUSED;
      }
      if (!m) return { effects: [{ kind: "push", href: event.href }] };
      return decide(
        state,
        { type: "navigate", to: event.href, key: m.instanceKey, resume: false },
        ctx,
      );
    }
    case "openFolder":
      return {
        effects: [
          wm({
            type: "open",
            id: event.key,
            program: event.key,
            size: folderSize(event.key),
            viewport: ctx.viewport,
          }),
        ],
      };
    case "focusWindow": {
      const w = state.windows.find((x) => x.id === event.id);
      if (!w) return NOTHING;
      if (w.id === liveKey || !w.lastUrl) {
        return { effects: [wm({ type: "focus", id: w.id })] };
      }
      return decide(
        state,
        { type: "navigate", to: w.lastUrl, key: w.id, resume: true },
        ctx,
      );
    }
    // Close and minimise REPLACE the address with the next window down (or
    // the desktop). The App Router owns history.state, so "go back if the
    // entry behind is that window" cannot be built: after a close, Back goes
    // to the entry before the closed window's and may open a window closed
    // earlier, fresh.
    case "close": {
      const { id } = event;
      // The live page may hold unsaved input: ask first, unless asked.
      if (id === liveKey && !event.asked && !ctx.mayLeave(id)) return REFUSED;
      // Closed on purpose (after the guard asked): no draft of it is kept,
      // in memory or in this tab's storage.
      const effects: Effect[] = [
        { kind: "dropCopy", id },
        { kind: "forgetDrafts", id },
      ];
      if (id === liveKey) {
        const next = nextPageWindow(state, id);
        effects.push(
          { kind: "closing", id },
          wm({ type: "close", id }),
          { kind: "resume", key: next?.id ?? null },
          // No window left: focus goes back to the program's icon when the
          // desktop arrives, not to <body>.
          { kind: "focusIconAfter", key: next ? null : id },
          { kind: "replace", href: next?.lastUrl ?? "/" },
        );
        return { effects };
      }
      effects.push(wm({ type: "close", id }), { kind: "focusAfterClose", id });
      return { effects };
    }
    case "closeLive":
      if (!liveKey) return NOTHING;
      return decide(state, { type: "close", id: liveKey }, ctx);
    case "minimize": {
      const { id } = event;
      // A taskbar press minimises the live window too: ask first, unless
      // its own button already did.
      if (id === liveKey && !event.asked && !ctx.mayLeave(id)) return REFUSED;
      const effects: Effect[] = [];
      if (id === liveKey) {
        const next = nextPageWindow(state, id);
        effects.push(
          { kind: "capture" },
          wm({ type: "minimize", id }),
          { kind: "resume", key: next?.id ?? null },
          { kind: "replace", href: next?.lastUrl ?? "/" },
        );
      } else {
        effects.push(wm({ type: "minimize", id }));
      }
      effects.push({ kind: "focusTask", id });
      return { effects };
    }
    case "showDesktop":
    case "goHome": {
      if (liveKey && !ctx.mayLeave(liveKey)) return REFUSED;
      const effects: Effect[] = [];
      if (liveKey) effects.push({ kind: "capture" });
      for (const w of state.windows) {
        if (!w.minimized) effects.push(wm({ type: "minimize", id: w.id }));
      }
      if (liveKey) {
        effects.push({ kind: "resume", key: null });
        if (event.type === "showDesktop") {
          effects.push({ kind: "replace", href: "/" });
        } else {
          // An entry of its own: Back from the home screen goes back into
          // the program the member left.
          effects.push(
            { kind: "pending", key: null },
            { kind: "push", href: "/" },
          );
        }
      }
      return { effects };
    }
    case "taskbarToggle": {
      const w = state.windows.find((x) => x.id === event.id);
      if (!w) return NOTHING;
      if (w.id === topWindow(state)?.id && !w.minimized) {
        return decide(state, { type: "minimize", id: w.id }, ctx);
      }
      return decide(state, { type: "focusWindow", id: w.id }, ctx);
    }
    case "tidy":
      return { effects: [wm({ type: "tidy", viewport: ctx.viewport })] };
    case "phoneBack": {
      // It cannot be asked about: a page with unsaved input kept its draft
      // (useWindowDirty) and gets it back when reopened.
      const { from } = event;
      if (from === liveKey) return NOTHING;
      return {
        effects: [
          { kind: "dropCopy", id: from },
          wm({ type: "close", id: from }),
        ],
      };
    }
    case "settlePreOpened": {
      // A window opened ahead of its page that the page never reached (a
      // gate sent the member elsewhere, or another click won): it goes, as
      // if never opened. Once the page has been live in it, it is an
      // ordinary window.
      const key = ctx.preOpened;
      if (!key) return NOTHING;
      if (liveKey === key)
        return { effects: [{ kind: "preOpened", key: null }] };
      if (event.navigating) return NOTHING;
      return {
        effects: [
          { kind: "preOpened", key: null },
          wm({ type: "close", id: key }),
        ],
      };
    }
  }
}

/**
 * A plan applied: its window changes folded into the state, the other
 * effects left for the caller. What the shell does over two renders, in one
 * call (tests).
 */
export function step(
  state: WmState<string>,
  event: DesktopEvent,
  ctx: DesktopContext,
): { state: WmState<string>; effects: Effect[]; refused: boolean } {
  const plan = decide(state, event, ctx);
  let next = state;
  const effects: Effect[] = [];
  for (const effect of plan.effects) {
    if (effect.kind === "wm") next = reduceWindows(next, effect.action);
    else effects.push(effect);
  }
  return { state: next, effects, refused: !!plan.refused };
}

// --- A new manifest: drop what the member may no longer open ---------------------

/**
 * The version changes only when what the member may open changes (a
 * demotion, a new team, the mode), never with a count (lib/programs.ts). The
 * layout loses what the member lost; the windows of programs they may no
 * longer open close, and take their kept drafts with them, as a close does:
 * text typed into an editor the member can no longer open is not kept for if
 * access comes back. The live page's own program stays: its gate let it
 * render.
 */
export function manifestChanged(input: {
  state: WmState<string>;
  manifest: ProgramManifest;
  layout: DesktopLayout;
  page: ProgramMatch | null;
  liveKey: string | null;
}): {
  layout: DesktopLayout;
  /** Windows to forget the drafts of, before they close. */
  forget: string[];
  prune: DesktopAction;
} {
  const { state, manifest, page, liveKey } = input;
  const next = pruneLayout(input.layout, {
    desktopKeys: desktopEntries(manifest, { cells: {}, items: [] }).map(
      (e) => e.key,
    ),
    programIds: [...programIndex(manifest).keys()],
  });
  const allowedNow = new Set([
    ...allowedWindowPrograms(manifest, next),
    ...(page && liveKey ? [windowProgram(page.programId, liveKey)] : []),
  ]);
  const forget = state.windows
    .filter(
      (w) =>
        !(
          allowedNow.has(w.program ?? w.id) &&
          (w.child === undefined || allowedNow.has(w.child))
        ),
    )
    .map((w) => w.id);
  return {
    layout: next,
    forget,
    prune: { type: "pruneTo", allowed: allowedNow },
  };
}

// --- When the desktop asks the server again --------------------------------------

/**
 * A popstate that is a real move through history: a fragment link on this
 * page (Skip to window) fires popstate too, and must not hide the page it is
 * focusing, nor cost a server round trip.
 */
export function isHistoryMove(now: string, committedUrl: string): boolean {
  return now !== committedUrl;
}

/**
 * A Back on a phone (the browser's, Android's, a swipe) that lands on
 * another window's page closes the window it left, so background windows do
 * not pile up: the window it left, or null.
 */
export function phoneBackFrom(input: {
  phone: boolean;
  liveKey: string | null;
  url: string;
  now: string;
}): string | null {
  const { phone, liveKey, url, now } = input;
  return phone && liveKey && now !== url ? liveKey : null;
}

/**
 * Back or Forward restored a page from the router's cache without asking the
 * server. It stays hidden until a refresh has run its gate again, on the page
 * now shown. The refresh waits until the router has moved to the popped
 * address: a refresh started before the move re-rendered the page being
 * left, then the move fetched the destination too.
 *
 * - "start": refresh now (the router is there).
 * - "wait": not moved yet; refresh after POP_SETTLE_MS whatever it shows.
 * - "done": the refresh has run; show the page.
 * - "busy": the refresh is still running.
 */
export function backForwardCheck(input: {
  started: boolean;
  refreshing: boolean;
  url: string;
  poppedTo: string | null;
}): "start" | "wait" | "done" | "busy" {
  if (!input.started) return input.url === input.poppedTo ? "start" : "wait";
  return input.refreshing ? "busy" : "done";
}

/** Coming back to a tab hidden this long or more refreshes the desktop. */
export function isStaleReturn(hiddenAt: number, now: number): boolean {
  return hiddenAt > 0 && now - hiddenAt >= STALE_AFTER_MS;
}

/**
 * A gate sent the member somewhere other than where the desktop sent them
 * (an approval taken back, a blocking questionnaire): what they may open may
 * have changed under them, so the manifest catches up.
 */
export function gateRedirected(
  sentTo: string | null,
  pathname: string,
  held: boolean,
): boolean {
  return sentTo !== null && sentTo !== pathname && !held;
}

/**
 * A page the gate refused (a CaptainLock): the member's programs may have
 * changed under them (a demotion by someone else), so the manifest catches
 * up. Once per address.
 */
export function refusedPageRefresh(
  locked: boolean,
  refreshedFor: string | null,
  url: string,
): boolean {
  return locked && refreshedFor !== url;
}

/**
 * Access changed elsewhere (an approval, a promotion, a demotion): the
 * server's manifest version is not the one drawn.
 */
export function accessChanged(
  serverVersion: string | null,
  drawnVersion: string | null,
): boolean {
  return serverVersion !== drawnVersion;
}
