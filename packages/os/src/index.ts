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
export {
  GroupedStartMenu,
  StartMenu,
  type StartMenuGroup,
  type StartMenuItem,
  type StartMenuRowProps,
} from "./start-menu";
export { DesktopIcon } from "./desktop-icon";
export { IconGroup } from "./icon-group";
export { FolderWindow, type FolderItem } from "./folder-window";
export { Boot } from "./boot";
export { Surface } from "./surface";
export { GlitchWordmark } from "./glitch-wordmark";
export { PHONE_QUERY, usePhone } from "./use-phone";
export {
  WindowDirtyProvider,
  WindowKeyProvider,
  useKeptDraft,
  useKeptDrafts,
  useLeaveGuard,
  useWindowDirty,
  useWindowKey,
} from "./use-window-dirty";
export {
  LAST_SEEN_BUDGET_CHARS,
  LAST_SEEN_MAX_COPIES,
  LAST_SEEN_MAX_COPY_CHARS,
  LastSeenStore,
  PRIVATE_ATTR,
  PRIVATE_PLACEHOLDER,
  captureLastSeen,
  lastSeenLabel,
  mountLastSeen,
  type LastSeenCopy,
} from "./last-seen";
export {
  DEFAULT_GEOMETRY,
  EMPTY_LAYOUT,
  LAYOUT_LIMITS,
  NEW_FOLDER_NAME,
  addFolder,
  addShortcut,
  addToFolder,
  cellKey,
  cellOrigin,
  cellsInBox,
  cleanFolderName,
  defaultPlacement,
  dropTargetFor,
  fitPlacement,
  gridSize,
  isMemberFolderId,
  isShortcutId,
  lineUpIcons,
  moveSelection,
  nearestFreeCell,
  neighbourIn,
  nextItemId,
  parseLayout,
  pruneLayout,
  readingOrder,
  removeFromFolder,
  removeItem,
  renameFolder,
  snapToCell,
  specKeys,
  withCells,
  type Cell,
  type Cells,
  type DefaultSpec,
  type DesktopLayout,
  type Direction,
  type GridGeometry,
  type GridSize,
  type LayoutFolder,
  type LayoutItem,
  type LayoutShortcut,
} from "./icon-grid";
export {
  DesktopIcons,
  iconName,
  type DesktopIconItem,
  type DesktopMenuRequest,
} from "./desktop-icons";
export {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuState,
} from "./context-menu";
export { FolderNameDialog } from "./folder-name-dialog";
export { BlockingLayer, useInBlockingLayer } from "./blocking-layer";
export {
  TODAY_OPEN_KEY,
  TodayGadget,
  localStorageBoolean,
  useStoredBoolean,
  type BooleanStore,
} from "./today-gadget";
export {
  TRAY_BOX,
  TRAY_PIP,
  Tray,
  TrayBalloon,
  TrayButton,
  useMinuteClock,
  type TraySlots,
} from "./tray";
export { focusFirst, tabStops, trapTab } from "./focus";
export { OS_BUTTON_PRIMARY, OS_BUTTON_SECONDARY } from "./buttons";
