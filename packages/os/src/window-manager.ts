// The desktop's windows as plain data: which are open, where, and which is on
// top. Pure, so the stacking and cascade rules are tested without a browser.
//
// Generic over the app's window key: Join keys a window by its program id
// (one window per program); the console will key one by its instance, so two
// meetings can be two windows.

export type Rect = { x: number; y: number; w: number; h: number };

export type OsWindow<K extends string = string> = Rect & {
  id: K;
  z: number;
  /** In the tray: not drawn, not the top window, restored by focus. */
  minimized?: boolean;
  /** Fills the desktop; its own rect is kept for the restore. */
  maximized?: boolean;
  /**
   * The program this window belongs to, and a program inside it (a tool in a
   * folder), for pruneTo. With no program, the window's own key is its
   * program.
   */
  program?: string;
  child?: string;
  /** The last address shown in this window (upsertUrl). */
  lastUrl?: string;
  /**
   * A title the page set while it was shown. In memory only: it can name a
   * person or a record, so hydrate drops it and nothing should save it.
   */
  title?: string;
};

/** Which side or corner of a window a resize grip pulls. */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type WmState<K extends string = string> = {
  windows: OsWindow<K>[];
  topZ: number;
};

export type Viewport = { width: number; height: number };

type Size = { w: number; h: number };

export type WmAction<K extends string = string> =
  | {
      type: "open";
      id: K;
      size: Size;
      viewport: Viewport;
      program?: string;
      child?: string;
    }
  | {
      /** Open the window for an address, or raise it; remember the address. */
      type: "upsertUrl";
      id: K;
      url: string;
      size: Size;
      viewport: Viewport;
      program?: string;
      child?: string;
    }
  | { type: "setTitle"; id: K; title: string | undefined }
  | { type: "close"; id: K }
  | { type: "focus"; id: K }
  | { type: "move"; id: K; x: number; y: number; viewport: Viewport }
  | {
      type: "resize";
      id: K;
      /** The rect when the drag began, and how far the pointer has moved. */
      from: Rect;
      edge: Edge;
      dx: number;
      dy: number;
      viewport: Viewport;
    }
  | { type: "minimize"; id: K }
  | { type: "toggleMaximize"; id: K }
  | { type: "closeAll" }
  /** Restore a saved stack, fitted to this screen. */
  | { type: "hydrate"; saved: WmState<K>; viewport: Viewport }
  /** Pull every window back on screen after the screen changed size. */
  | { type: "reclamp"; viewport: Viewport }
  /** Close every window whose program (or program inside it) is not listed. */
  | { type: "pruneTo"; allowed: Iterable<string> };

export const INITIAL_WM: WmState<never> = { windows: [], topZ: 0 };

export const MIN_SIZE = { w: 260, h: 160 };
/** Each new window lands this far down and right of the last one. */
export const CASCADE_STEP = 28;
/** A title bar may leave the screen, but this much of it stays reachable. */
export const GRAB_MARGIN = 64;
/** A new or refitted window leaves this much of the desktop around it. */
const FIT_MARGIN = 16;

/** The highest window still on the desktop; a minimised one never counts. */
export function topWindow<K extends string>(
  state: WmState<K>,
): OsWindow<K> | undefined {
  let top: OsWindow<K> | undefined;
  for (const w of state.windows) {
    if (w.minimized) continue;
    if (!top || w.z > top.z) top = w;
  }
  return top;
}

/**
 * The rect after dragging one edge or corner by (dx, dy): never smaller than
 * MIN_SIZE (the opposite edge stays put) and never past the desktop.
 */
export function resizeRect(
  from: Rect,
  edge: Edge,
  dx: number,
  dy: number,
  viewport: Viewport,
): Rect {
  let { x, y, w, h } = from;
  const right = from.x + from.w;
  const bottom = from.y + from.h;
  if (edge.includes("e")) {
    w = Math.min(Math.max(from.w + dx, MIN_SIZE.w), viewport.width - from.x);
  }
  if (edge.includes("s")) {
    h = Math.min(Math.max(from.h + dy, MIN_SIZE.h), viewport.height - from.y);
  }
  if (edge.includes("w")) {
    x = Math.min(Math.max(from.x + dx, 0), right - MIN_SIZE.w);
    w = right - x;
  }
  if (edge.includes("n")) {
    y = Math.min(Math.max(from.y + dy, 0), bottom - MIN_SIZE.h);
    h = bottom - y;
  }
  return { x, y, w, h };
}

function clampPosition(x: number, y: number, w: number, viewport: Viewport) {
  return {
    x: Math.min(Math.max(x, GRAB_MARGIN - w), viewport.width - GRAB_MARGIN),
    y: Math.min(Math.max(y, 0), viewport.height - 32),
  };
}

/** A window shrunk to fit the screen, with its title bar in reach. */
function fitRect(r: Rect, viewport: Viewport): Rect {
  const w = Math.max(Math.min(r.w, viewport.width - FIT_MARGIN), MIN_SIZE.w);
  const h = Math.max(Math.min(r.h, viewport.height - FIT_MARGIN), MIN_SIZE.h);
  return { w, h, ...clampPosition(r.x, r.y, w, viewport) };
}

/** The state with one window changed. */
function mapWindow<K extends string>(
  state: WmState<K>,
  id: K,
  change: (w: OsWindow<K>) => OsWindow<K>,
): WmState<K> {
  return {
    ...state,
    windows: state.windows.map((w) => (w.id === id ? change(w) : w)),
  };
}

function openWindow<K extends string>(
  state: WmState<K>,
  id: K,
  size: Size,
  viewport: Viewport,
  extra: Partial<OsWindow<K>>,
): WmState<K> {
  const w = Math.min(size.w, viewport.width - FIT_MARGIN);
  const h = Math.min(size.h, viewport.height - FIT_MARGIN);
  const n = state.windows.length;
  // Centre the first window, then cascade; wrap back to the top-left of the
  // cascade once it would run off the bottom or right.
  const baseX = Math.round((viewport.width - w) / 2);
  const baseY = Math.round((viewport.height - h) / 1.6);
  let x = baseX + n * CASCADE_STEP;
  let y = baseY + n * CASCADE_STEP;
  if (x + w > viewport.width || y + h > viewport.height) {
    // The wrapped offset is clamped so the whole window stays on screen; a
    // window as large as the screen allows (size - FIT_MARGIN) sits at the
    // margin. Positions that do not wrap are untouched.
    const steps = n % 4;
    const offset = FIT_MARGIN + steps * CASCADE_STEP;
    x = Math.max(FIT_MARGIN, Math.min(offset, viewport.width - w - FIT_MARGIN));
    y = Math.max(
      FIT_MARGIN,
      Math.min(offset, viewport.height - h - FIT_MARGIN),
    );
  }
  const z = state.topZ + 1;
  return {
    windows: [...state.windows, { ...extra, id, x, y, w, h, z }],
    topZ: z,
  };
}

export function wmReducer<K extends string>(
  state: WmState<K>,
  action: WmAction<K>,
): WmState<K> {
  switch (action.type) {
    case "open": {
      const existing = state.windows.find((w) => w.id === action.id);
      if (existing) return wmReducer(state, { type: "focus", id: action.id });
      const { program, child } = action;
      return openWindow(state, action.id, action.size, action.viewport, {
        ...(program !== undefined && { program }),
        ...(child !== undefined && { child }),
      });
    }
    case "upsertUrl": {
      const { id, url, program, child } = action;
      const extra = {
        lastUrl: url,
        ...(program !== undefined && { program }),
        ...(child !== undefined && { child }),
      };
      if (!state.windows.some((w) => w.id === id)) {
        return openWindow(state, id, action.size, action.viewport, extra);
      }
      const focused = wmReducer(state, { type: "focus", id });
      return mapWindow(focused, id, (w) => ({ ...w, ...extra }));
    }
    case "setTitle": {
      const target = state.windows.find((w) => w.id === action.id);
      if (!target || target.title === action.title) return state;
      return mapWindow(state, action.id, ({ title: _old, ...w }) =>
        action.title === undefined ? w : { ...w, title: action.title },
      );
    }
    case "close":
      return {
        ...state,
        windows: state.windows.filter((w) => w.id !== action.id),
      };
    case "closeAll":
      // A reboot starts the stack again from the bottom.
      return INITIAL_WM;
    case "focus": {
      const target = state.windows.find((w) => w.id === action.id);
      if (!target || (target.z === state.topZ && !target.minimized)) {
        return state;
      }
      const z = state.topZ + 1;
      return {
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, z, minimized: false } : w,
        ),
        topZ: z,
      };
    }
    case "minimize":
      return mapWindow(state, action.id, (w) => ({ ...w, minimized: true }));
    case "toggleMaximize":
      return mapWindow(state, action.id, (w) => ({
        ...w,
        maximized: !w.maximized,
      }));
    case "move":
      return mapWindow(state, action.id, (w) => ({
        ...w,
        ...clampPosition(action.x, action.y, w.w, action.viewport),
      }));
    case "resize":
      return mapWindow(state, action.id, (w) => ({
        ...w,
        ...resizeRect(
          action.from,
          action.edge,
          action.dx,
          action.dy,
          action.viewport,
        ),
      }));
    case "hydrate": {
      // Titles are never restored: a saved one could name a person.
      const windows = action.saved.windows.map(({ title: _title, ...w }) => ({
        ...w,
        ...fitRect(w, action.viewport),
      }));
      const topZ = windows.reduce((z, w) => Math.max(z, w.z), 0);
      return { windows, topZ };
    }
    case "reclamp": {
      let changed = false;
      const windows = state.windows.map((w) => {
        const r = fitRect(w, action.viewport);
        if (r.x === w.x && r.y === w.y && r.w === w.w && r.h === w.h) return w;
        changed = true;
        return { ...w, ...r };
      });
      return changed ? { ...state, windows } : state;
    }
    case "pruneTo": {
      const allowed = new Set(action.allowed);
      const windows = state.windows.filter(
        (w) =>
          allowed.has(w.program ?? w.id) &&
          (w.child === undefined || allowed.has(w.child)),
      );
      // The top goes to the highest window left, as a close hands it down.
      return windows.length === state.windows.length
        ? state
        : { ...state, windows };
    }
  }
}
