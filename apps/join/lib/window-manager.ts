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

export type AppId = (typeof APP_IDS)[number];

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}

export type Rect = { x: number; y: number; w: number; h: number };

export type OsWindow = Rect & { id: AppId; z: number };

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
  | { type: "resize"; id: AppId; w: number; h: number; viewport: Viewport }
  | { type: "closeAll" };

export const INITIAL_WM: WmState = { windows: [], topZ: 0 };

export const MIN_SIZE = { w: 260, h: 160 };
/** Each new window lands this far down and right of the last one. */
export const CASCADE_STEP = 28;
/** A title bar may leave the screen, but this much of it stays reachable. */
const GRAB_MARGIN = 64;

export function topWindow(state: WmState): OsWindow | undefined {
  let top: OsWindow | undefined;
  for (const w of state.windows) if (!top || w.z > top.z) top = w;
  return top;
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
      return { ...state, windows: [] };
    case "focus": {
      const target = state.windows.find((w) => w.id === action.id);
      if (!target || target.z === state.topZ) return state;
      const z = state.topZ + 1;
      return {
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, z } : w,
        ),
        topZ: z,
      };
    }
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
                w: Math.min(
                  Math.max(action.w, MIN_SIZE.w),
                  action.viewport.width - w.x,
                ),
                h: Math.min(
                  Math.max(action.h, MIN_SIZE.h),
                  action.viewport.height - w.y,
                ),
              }
            : w,
        ),
      };
  }
}
