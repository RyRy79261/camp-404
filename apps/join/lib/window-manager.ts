// The desktop's windows as plain data: which are open, where, and which is on
// top. Pure, so the stacking and cascade rules are tested without a browser.

export const APP_IDS = [
  "readme",
  "teams",
  "gifts",
  "map",
  "crew",
  "schedule",
  "fee",
  "perks",
  "truck",
  "terminal",
  "apply",
] as const;

/** Programs with no desktop icon and no Start menu entry: found, not shown. */
export const SECRET_APP_IDS = ["inkblot"] as const;

export type AppId = (typeof APP_IDS)[number] | (typeof SECRET_APP_IDS)[number];

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}

export type Rect = { x: number; y: number; w: number; h: number };

export type OsWindow = Rect & {
  id: AppId;
  z: number;
  /** In the tray: not drawn, not the top window, restored by focus. */
  minimized?: boolean;
  /** Fills the desktop; its own rect is kept for the restore. */
  maximized?: boolean;
};

/** Which side or corner of a window a resize grip pulls. */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type WmState = { windows: OsWindow[]; topZ: number };

export type Viewport = { width: number; height: number };

export type WmAction =
  | {
      type: "open";
      id: AppId;
      size: { w: number; h: number };
      viewport: Viewport;
    }
  | { type: "close"; id: AppId }
  | { type: "focus"; id: AppId }
  | { type: "move"; id: AppId; x: number; y: number; viewport: Viewport }
  | {
      type: "resize";
      id: AppId;
      /** The rect when the drag began, and how far the pointer has moved. */
      from: Rect;
      edge: Edge;
      dx: number;
      dy: number;
      viewport: Viewport;
    }
  | { type: "minimize"; id: AppId }
  | { type: "toggleMaximize"; id: AppId }
  | { type: "closeAll" };

export const INITIAL_WM: WmState = { windows: [], topZ: 0 };

export const MIN_SIZE = { w: 260, h: 160 };
/** Each new window lands this far down and right of the last one. */
export const CASCADE_STEP = 28;
/** A title bar may leave the screen, but this much of it stays reachable. */
const GRAB_MARGIN = 64;

/** The highest window still on the desktop; a minimised one never counts. */
export function topWindow(state: WmState): OsWindow | undefined {
  let top: OsWindow | undefined;
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

export function wmReducer(state: WmState, action: WmAction): WmState {
  switch (action.type) {
    case "open": {
      const existing = state.windows.find((w) => w.id === action.id);
      if (existing) return wmReducer(state, { type: "focus", id: action.id });
      const { viewport } = action;
      const w = Math.min(action.size.w, viewport.width - 16);
      const h = Math.min(action.size.h, viewport.height - 16);
      const n = state.windows.length;
      // Centre the first window, then cascade; wrap back to the top-left of
      // the cascade once it would run off the bottom or right.
      const baseX = Math.round((viewport.width - w) / 2);
      const baseY = Math.round((viewport.height - h) / 1.6);
      let x = baseX + n * CASCADE_STEP;
      let y = baseY + n * CASCADE_STEP;
      if (x + w > viewport.width || y + h > viewport.height) {
        const steps = n % 4;
        x = 16 + steps * CASCADE_STEP;
        y = 16 + steps * CASCADE_STEP;
      }
      const z = state.topZ + 1;
      return {
        windows: [...state.windows, { id: action.id, x, y, w, h, z }],
        topZ: z,
      };
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
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, minimized: true } : w,
        ),
      };
    case "toggleMaximize":
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, maximized: !w.maximized } : w,
        ),
      };
    case "move":
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id
            ? {
                ...w,
                ...clampPosition(action.x, action.y, w.w, action.viewport),
              }
            : w,
        ),
      };
    case "resize":
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id
            ? {
                ...w,
                ...resizeRect(
                  action.from,
                  action.edge,
                  action.dx,
                  action.dy,
                  action.viewport,
                ),
              }
            : w,
        ),
      };
  }
}
