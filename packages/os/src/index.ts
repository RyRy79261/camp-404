// @camp404/os: the 404 OS window engine, shared by join.camp-404.com and the
// console. Themed only through --os-* CSS variables (styles.css); no app's
// content lives here, and no game (those are @camp404/games).

export {
  CASCADE_STEP,
  GRAB_MARGIN,
  INITIAL_WM,
  MIN_SIZE,
  resizeRect,
  topWindow,
  wmReducer,
  type Edge,
  type OsWindow,
  type Rect,
  type Viewport,
  type WmAction,
  type WmState,
} from "./window-manager";
export { OsWindowFrame } from "./os-window";
export { Taskbar, type TaskbarWindow } from "./taskbar";
export { StartMenu, type StartMenuItem } from "./start-menu";
export { DesktopIcon } from "./desktop-icon";
export { IconGroup } from "./icon-group";
export { FolderWindow, type FolderItem } from "./folder-window";
export { Boot } from "./boot";
export { PHONE_QUERY, usePhone } from "./use-phone";
export {
  WindowDirtyProvider,
  WindowKeyProvider,
  useLeaveGuard,
  useWindowDirty,
} from "./use-window-dirty";
