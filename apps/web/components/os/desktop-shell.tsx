"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BlockingLayer,
  CASCADE_STEP,
  MIN_SIZE,
  ContextMenu,
  DesktopIcons,
  FolderNameDialog,
  FolderWindow,
  GlitchWordmark,
  INITIAL_WM,
  LastSeenStore,
  OsWindowFrame,
  PHONE_QUERY,
  Surface,
  TODAY_OPEN_KEY,
  TodayGadget,
  WindowDirtyProvider,
  addFolder,
  addShortcut,
  addToFolder,
  captureLastSeen,
  isMemberFolderId,
  lineUpIcons,
  localStorageBoolean,
  pruneLayout,
  removeFromFolder,
  removeItem,
  renameFolder,
  topWindow,
  useKeptDrafts,
  useLeaveGuard,
  usePhone,
  useStoredBoolean,
  withCells,
  wmReducer,
  type ContextMenuEntry,
  type ContextMenuState,
  type DesktopIconItem,
  type DesktopLayout,
  type DesktopMenuRequest,
  type OsWindow,
  type Viewport,
  type WmAction,
  type WmState,
} from "@camp404/os";
import { desktopFolderKey } from "@camp404/types";
import { toast } from "@camp404/ui/components/toast";
import { saveDesktopLayoutAction } from "@/app/(console)/desktop-layout-actions";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import type {
  ClientProgram,
  ManifestMode,
  ProgramManifest,
} from "@/lib/programs";
import {
  PROGRAM_TITLES,
  matchProgram,
  type ProgramId,
} from "@/lib/program-routes";
import {
  allowedWindowPrograms,
  desktopEntries,
  desktopSpec,
  homeScreenGroups,
  memberFolders,
  programIndex,
  windowProgram,
  type DesktopEntry,
} from "./desktop-items";
import { DesktopHeader } from "./desktop-header";
import {
  DesktopTaskbar,
  EmptyTaskbar,
  type DesktopAccount,
} from "./desktop-taskbar";
import { APPLICATION_SUBMITTED, HealthItem } from "./desktop-tray";
import { DraftOwnerContext } from "./editor-draft";
import { DesktopSignalsContext, type DesktopSignals } from "./held-screen";
import { LastSeenView, WindowPlaceholder } from "./last-seen-view";
import {
  PhoneBar,
  PhoneHome,
  PhoneSheet,
  PhoneSwitcher,
  type PhoneGroup,
  PhoneClock,
} from "./phone-chrome";
import { PinnedList, PinnedStrip, type PinnedItem } from "./pinned-strip";
import { folderIcon, iconFor, programIcon } from "./program-icons";
import { ConsoleBoot } from "./console-boot";
import {
  ClockPrince,
  DesktopSecrets,
  TeamsFolderArt,
  WindowPeek,
} from "./desktop-cats";
import { INKBLOT_HREF, type TerminalEffect } from "@/lib/terminal-commands";
import type { BootLine } from "@/lib/boot";
import { TRAY_BELL } from "./desktop-tray";
import {
  forgetOtherMembers,
  forgetWindowDrafts,
  parseWindows,
  serializeWindows,
  windowStorageKey,
} from "./window-storage";

// The 404 OS desktop (docs/specs/2026-09-25-404-os-console-design.md): the
// console's signed-in shell. THE URL IS THE FOCUSED WINDOW. Every console page
// keeps its path, its server gate and its status codes; the page for the
// current URL renders, live, inside that URL's window. Every other open
// window shows a frozen copy of how it last looked (decision 3 A), inert, in a
// closed shadow root, and focusing it navigates to its last address, so it
// renders fresh behind its own gate. Only ONE live page body is ever in the
// DOM (a layout's `children` always renders the current route; PR C spike).
//
// What the desktop decides is only the picture. The member's programs,
// folders and tray come from the manifest the server built for them; hiding
// an icon is never the security boundary, every page and action keeps its
// gate.

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
const TEAMS_FOLDER_KEY = desktopFolderKey("teams");
const CAMP_FOLDER_SIZE: Record<string, { w: number; h: number }> = {
  [TEAMS_FOLDER_KEY]: { w: 620, h: 600 },
  [desktopFolderKey("kitchen")]: { w: 440, h: 180 },
  [desktopFolderKey("captains")]: { w: 560, h: 340 },
};
function folderSize(key: string): { w: number; h: number } {
  return CAMP_FOLDER_SIZE[key] ?? FOLDER_SIZE;
}
/**
 * Pages drawn for a wide screen open larger, as the prototype sizes them
 * (its XL and L): still a window right of the icons, never full screen
 * (owner's approval of the prototype, 2026-09-26). Each is cut to the room
 * the screen has, and its page reflows to the window (the page-* variants).
 */
const XL_SIZE = { w: 1040, h: 660 };
const L_SIZE = { w: 880, h: 600 };
const S_SIZE = { w: 520, h: 440 };
const PAGE_SIZE: Partial<Record<ProgramId, { w: number; h: number }>> = {
  tasks: XL_SIZE,
  roster: XL_SIZE,
  payments: XL_SIZE,
  "edit-questionnaire": XL_SIZE,
  "edit-recipe": XL_SIZE,
  results: XL_SIZE,
  "respondent-answers": XL_SIZE,
  calendar: L_SIZE,
  power: L_SIZE,
  recipes: L_SIZE,
  recipe: L_SIZE,
  "meal-plan": L_SIZE,
  "recipe-review": L_SIZE,
  overview: L_SIZE,
  questionnaires: L_SIZE,
  announcements: L_SIZE,
  "join-site": L_SIZE,
  audit: L_SIZE,
  "new-event": S_SIZE,
  terminal: { w: 640, h: 420 },
  inkblot: { w: 700, h: 440 },
};
/** A tab back after this long refreshes the desktop (an event, not a timer). */
const STALE_AFTER_MS = 5 * 60_000;
/** How long the desktop waits after the last icon move before it saves. */
const SAVE_LAYOUT_AFTER_MS = 800;
/** A held member's page that is not the form: the content column, no desktop. */
const HELD_BARE = "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6";
/** A screen before it has been measured: the server's first paint. */
const FIRST_VIEWPORT: Viewport = { width: 1280, height: 720 };

type Action =
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
    const size = w.lastUrl ? pageSize(w.program) : folderSize(w.id);
    place.set(w.id, { ...w, ...placeAt(i, size, vp), maximized: false });
  });
  if (place.size === 0) return state;
  return {
    ...state,
    windows: state.windows.map((w) => place.get(w.id) ?? w),
  };
}

/** A page's opening size: its own, else the default. */
function pageSize(program: string | undefined): { w: number; h: number } {
  return (program && PAGE_SIZE[program as ProgramId]) || DEFAULT_SIZE;
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

function reducer(state: WmState<string>, action: Action): WmState<string> {
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
      windows.push({
        ...live,
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
function nextPageWindow(
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

/** A window's frame on the desktop, by its key. */
function windowFrame(key: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(
    "#os-desktop [data-window]",
  )) {
    if (el.dataset.window === key) return el;
  }
  return null;
}

/** The live window's body element, by its key. */
function liveBody(key: string | null): HTMLElement | null {
  if (!key) return null;
  return (
    windowFrame(key)?.querySelector<HTMLElement>("[data-window-body]") ?? null
  );
}

type NameDialog =
  | { kind: "new"; addTarget?: string }
  | { kind: "rename"; id: string; name: string }
  | null;

export interface DesktopProps {
  mode: ManifestMode;
  manifest: ProgramManifest;
  /** The member's saved layout, pruned against the manifest on the server. */
  layout: DesktopLayout;
  /** The signed-in member's own id: the window stack's storage key. */
  userId: string;
  /** Their name, rank label and led teams: the account chip and Start menu. */
  account: DesktopAccount;
  /**
   * A captain's Start menu header: the camp's approved members and the
   * sign-ups waiting. Null for anyone else.
   */
  headcount?: { members: number; waiting: number } | null;
  /**
   * Pinned announcements (id and title), a strip above the taskbar and a
   * tray item. Only a cleared member's manifest draws them.
   */
  pins?: readonly PinnedItem[];
  /** The Burn's dates this year, for the tray's countdown. */
  burn?: { start: string; end: string } | null;
  /** The camp's year, for the countdown's tooltip. */
  year?: number | null;
  /**
   * Under the wallpaper's wordmark: "AfrikaBurn 2027 · The Big Question",
   * from camp settings; nothing before a captain names the year.
   */
  tagline?: string | null;
  /**
   * The Today gadget (the prototype's pop-out, on every screen): its body,
   * rendered on the server, and the count on its handle. None for a held
   * member.
   */
  today?: { count: number; body: ReactNode } | null;
  /**
   * The boot screen's lines, when it plays: once per browser session, never
   * in tests (the layout decides). Null for no boot.
   */
  boot?: { lines: readonly BootLine[]; welcome: string } | null;
  children: ReactNode;
}

/** The desktop. Wraps the dirty registry every window's guard reads. */
export function Desktop(props: DesktopProps) {
  return (
    <WindowDirtyProvider>
      <DraftOwnerContext.Provider value={props.userId}>
        <DesktopInner {...props} />
      </DraftOwnerContext.Provider>
    </WindowDirtyProvider>
  );
}

/** The phone layout, asked when something happens (never while rendering). */
function onPhoneNow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_QUERY).matches
  );
}

function DesktopInner({
  mode,
  manifest,
  layout: savedLayout,
  userId,
  account,
  headcount = null,
  pins = [],
  burn = null,
  year = null,
  tagline = null,
  today = null,
  boot = null,
  children,
}: DesktopProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = search ? `${pathname}?${search}` : pathname;
  const match = matchProgram(pathname);
  const page = match && match.programId !== "desktop" ? match : null;
  const liveKey = page?.instanceKey ?? null;
  const mayLeave = useLeaveGuard();
  const keptDrafts = useKeptDrafts();

  // --- The cats (desktop-cats.tsx) ----------------------------------------------
  // Paw prints behind the pointer ("meow" on the desktop or in the Terminal,
  // again to stop), and when the Terminal's "sudo feed cat" last ran, so Jinn
  // peeks over the focused window at once. Rare events, never per frame.
  const [paws, setPaws] = useState(false);
  const [fedAt, setFedAt] = useState(0);
  const pawsNow = useRef(false);
  const togglePaws = useCallback(() => {
    const on = !pawsNow.current;
    pawsNow.current = on;
    setPaws(on);
    // No prints under reduced motion, so nothing to announce.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (on) {
      toast("Meow", {
        description:
          "Paw prints follow your pointer. Type meow again to stop them.",
      });
    } else {
      toast("Paws off", { description: "The paw prints stop." });
    }
  }, []);
  const catEffect = useCallback(
    (effect: TerminalEffect) => {
      if (effect === "paws") togglePaws();
      else setFedAt(Date.now());
    },
    [togglePaws],
  );

  // --- Held by a blocking questionnaire ---------------------------------------
  // The page that said a blocking questionnaire holds the member (its
  // <HeldScreen>). Held on that address only: the next page says again if the
  // member is still held, and the layout's own held branch covers the rest.
  const [heldOn, setHeldOn] = useState<string | null>(null);
  const held = mode === "held" || heldOn === pathname;

  // --- The screen ----------------------------------------------------------------
  const [viewport, setViewport] = useState<Viewport>(FIRST_VIEWPORT);
  // The phone's sheets (open programs, Today) and its soft keyboard.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const layer = useRef<HTMLDivElement>(null);

  // The page's own requests (the Terminal's open and exit), through refs so
  // the signals context stays the same object while windows come and go.
  const openHrefRef = useRef<(href: string) => void>(() => {});
  const closeLiveRef = useRef<() => void>(() => {});

  // --- Windows ---------------------------------------------------------------------
  const openPageAction = useCallback(
    (vp: Viewport): Action | null =>
      page
        ? {
            type: "openPage",
            id: page.instanceKey,
            url,
            program: windowProgram(page.programId, page.instanceKey),
            size: pageSize(page.programId),
            viewport: vp,
          }
        : null,
    [page, url],
  );
  const [wm, dispatch] = useReducer(reducer, INITIAL_WM, (initial) => {
    const open = openPageAction(FIRST_VIEWPORT);
    return open && mode !== "held" ? reducer(initial, open) : initial;
  });
  // A window the member closed while it was the live one: its address is
  // still the URL until the replace lands, and it must not open again.
  const [closing, setClosing] = useState<string | null>(null);
  // A new address opens or raises its window in the same render, so the page
  // never paints for a moment inside the window it is leaving. (Adjusting
  // state while rendering, compared with the address last seen.)
  const [seenUrl, setSeenUrl] = useState(url);
  const liveMissing =
    !!page &&
    !held &&
    page.instanceKey !== closing &&
    !wm.windows.some((w) => w.id === page.instanceKey);
  if (seenUrl !== url || liveMissing) {
    if (seenUrl !== url) {
      setSeenUrl(url);
      setClosing(null);
      // A new page on a phone: the sheets over the old one go, and Today
      // stays open only on the home screen, where its body is.
      setSwitcherOpen(false);
      if (pathname !== "/") setTodayOpen(false);
    }
    const open = held ? null : openPageAction(viewport);
    if (open) dispatch(open);
  }
  const top = topWindow(wm);

  // --- Last-seen copies (memory only) ---------------------------------------------
  const copies = useRef<LastSeenStore>(null);
  if (copies.current === null) copies.current = new LastSeenStore();
  const [, copiesChanged] = useReducer((n: number) => n + 1, 0);
  const scrollTops = useRef(new Map<string, number>());
  const resumeKey = useRef<string | null>(null);

  /** Copy the live window's body before it stops being the live one. */
  const captureLive = useCallback(() => {
    if (held || !liveKey) return;
    const body = liveBody(liveKey);
    if (!body) return;
    scrollTops.current.set(liveKey, body.scrollTop);
    const copy = captureLastSeen(body);
    const store = copies.current!;
    if (copy) store.put(liveKey, copy);
    else store.drop(liveKey);
    copiesChanged();
  }, [held, liveKey]);

  // --- The member's layout (icons, shortcuts, folders) ------------------------------
  const [layout, setLayout] = useState<DesktopLayout>(savedLayout);
  const saveTimer = useRef<number | undefined>(undefined);
  // A change not yet sent: saved now if the page goes away first.
  const unsaved = useRef<DesktopLayout | null>(null);
  const flushLayout = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const next = unsaved.current;
    if (!next) return;
    unsaved.current = null;
    void saveDesktopLayoutAction(next).then(
      (result) => {
        if (!result.ok) toast.error(result.error);
      },
      () => toast.error("Your desktop couldn't be saved."),
    );
  }, []);
  const changeLayout = useCallback(
    (next: DesktopLayout) => {
      setLayout(next);
      unsaved.current = next;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushLayout, SAVE_LAYOUT_AFTER_MS);
    },
    [flushLayout],
  );
  // An icon moved just before a reload, a sign-out or a closed tab is still
  // kept: the wait is cut short when the page is hidden or goes, and when
  // the desktop itself goes (a page outside the console).
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushLayout();
    };
    window.addEventListener("pagehide", flushLayout);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushLayout);
      document.removeEventListener("visibilitychange", onHidden);
      flushLayout();
    };
  }, [flushLayout]);

  const entries = useMemo(
    () => desktopEntries(manifest, layout),
    [manifest, layout],
  );
  const entryByKey = useMemo(
    () => new Map(entries.map((e) => [e.key, e] as const)),
    [entries],
  );
  const programs = useMemo(() => programIndex(manifest), [manifest]);
  const allowed = useMemo(
    () => allowedWindowPrograms(manifest, layout),
    [manifest, layout],
  );

  // --- Navigating ----------------------------------------------------------------
  const [navigating, startNav] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const pendingKey = navigating ? target : null;

  /** Go to a page address: the one way the desktop itself switches windows. */
  // Where the desktop last sent the member, to tell when a gate redirected
  // them somewhere else (their access may have changed).
  const sentTo = useRef<string | null>(null);
  const navigateTo = useCallback(
    (to: string, key: string | null, resume: boolean) => {
      if (liveKey && key !== liveKey && !mayLeave(liveKey)) return;
      captureLive();
      resumeKey.current = resume ? key : null;
      sentTo.current = new URL(to, window.location.href).pathname;
      setTarget(key);
      startNav(() => router.push(to as Route));
    },
    [captureLive, liveKey, mayLeave, router],
  );

  /** Open a program's address: raise its window if open, else go there. */
  const openHref = useCallback(
    (href: string) => {
      const m = matchProgram(href);
      if (!m) return;
      if (m.instanceKey === liveKey) {
        dispatch({ type: "focus", id: m.instanceKey });
        return;
      }
      const open = wm.windows.find((w) => w.id === m.instanceKey);
      navigateTo(open?.lastUrl ?? href, m.instanceKey, !!open);
    },
    [liveKey, navigateTo, wm.windows],
  );
  const openProgram = useCallback(
    (program: ClientProgram) => openHref(program.href),
    [openHref],
  );

  const openFolder = useCallback(
    (key: string) => {
      dispatch({
        type: "open",
        id: key,
        program: key,
        size: folderSize(key),
        viewport,
      });
    },
    [viewport],
  );

  /** Raise a window: a folder at once, a page by going to its address. */
  const focusWindow = useCallback(
    (w: OsWindow<string>) => {
      if (w.id === liveKey || !w.lastUrl) {
        dispatch({ type: "focus", id: w.id });
        return;
      }
      navigateTo(w.lastUrl, w.id, true);
    },
    [liveKey, navigateTo],
  );

  // The icon a closed window came from, to hand focus to when no window is
  // left (design doc, section 6): its desktop icon, or the folder icon that
  // holds it, or on a phone its home-screen button; else Start.
  const focusIconAfter = useRef<string | null>(null);
  const focusIconOf = useCallback(
    (windowKey: string) => {
      const instanceOf = (p: ClientProgram) =>
        matchProgram(p.href)?.instanceKey;
      let key: string | undefined = entries.find((e) =>
        e.kind === "program" || e.kind === "shortcut"
          ? instanceOf(e.program) === windowKey
          : e.key === windowKey,
      )?.key;
      key ??= entries.find(
        (e) =>
          (e.kind === "folder" || e.kind === "team-folder") &&
          e.folder.programs.some((p) => instanceOf(p) === windowKey),
      )?.key;
      const phone = onPhoneNow();
      const el =
        (key &&
          [
            ...document.querySelectorAll<HTMLElement>(
              phone
                ? "[data-phone-icon]"
                : "#os-desktop [data-os-icons] [data-key]",
            ),
          ].find(
            (x) => (phone ? x.dataset.phoneIcon : x.dataset.key) === key,
          )) ||
        document.querySelector<HTMLElement>(
          phone ? "[data-phone-icon]" : "#os-desktop [data-os-start-button]",
        );
      el?.focus({ preventScroll: true });
    },
    [entries],
  );

  const focusIconOfRef = useRef(focusIconOf);
  useEffect(() => {
    focusIconOfRef.current = focusIconOf;
  });

  // Close and minimise REPLACE the address with the next window down (or the
  // desktop). The App Router owns history.state, so "go back if the entry
  // behind is that window" cannot be built: after a close, Back goes to the
  // entry before the closed window's and may open a window closed earlier,
  // fresh.
  const closeWindow = useCallback(
    (id: string) => {
      copies.current!.drop(id);
      scrollTops.current.delete(id);
      // Closed on purpose (after the guard asked): no draft of it is kept,
      // in memory or in this tab's storage.
      keptDrafts.drop(id);
      try {
        forgetWindowDrafts(window.sessionStorage, userId, id);
      } catch {
        // Storage refused; nothing was kept there.
      }
      if (id === liveKey) {
        const next = nextPageWindow(wm, id);
        setClosing(id);
        dispatch({ type: "close", id });
        resumeKey.current = next?.id ?? null;
        // No window left: focus goes back to the program's icon when the
        // desktop arrives, not to <body>.
        focusIconAfter.current = next ? null : id;
        router.replace((next?.lastUrl ?? "/") as Route);
        return;
      }
      dispatch({ type: "close", id });
      requestAnimationFrame(() => {
        const nextTop = document.querySelector<HTMLElement>(
          "#os-desktop [data-top]",
        );
        if (nextTop) nextTop.focus({ preventScroll: true });
        else focusIconOf(id);
      });
    },
    [focusIconOf, keptDrafts, liveKey, router, userId, wm],
  );

  const minimizeWindow = useCallback(
    (id: string) => {
      if (id === liveKey) {
        captureLive();
        const next = nextPageWindow(wm, id);
        dispatch({ type: "minimize", id });
        resumeKey.current = next?.id ?? null;
        router.replace((next?.lastUrl ?? "/") as Route);
      } else {
        dispatch({ type: "minimize", id });
      }
      requestAnimationFrame(() => {
        for (const el of document.querySelectorAll<HTMLElement>(
          "[data-task]",
        )) {
          if (el.dataset.task === id) el.focus({ preventScroll: true });
        }
      });
    },
    [captureLive, liveKey, router, wm],
  );

  /** Minimise every window; the address goes to the desktop. */
  const showDesktop = useCallback(() => {
    if (liveKey && !mayLeave(liveKey)) return;
    if (liveKey) captureLive();
    for (const w of wm.windows) {
      if (!w.minimized) dispatch({ type: "minimize", id: w.id });
    }
    if (liveKey) {
      resumeKey.current = null;
      router.replace("/");
    }
  }, [captureLive, liveKey, mayLeave, router, wm.windows]);

  // What a page inside a window may ask of the desktop (the Terminal).
  useEffect(() => {
    openHrefRef.current = openHref;
    closeLiveRef.current = () => {
      if (liveKey && mayLeave(liveKey)) closeWindow(liveKey);
    };
  });

  const toggleFromTaskbar = useCallback(
    (id: string) => {
      const w = wm.windows.find((x) => x.id === id);
      if (!w) return;
      if (w.id === top?.id && !w.minimized) minimizeWindow(id);
      else focusWindow(w);
    },
    [focusWindow, minimizeWindow, top?.id, wm.windows],
  );

  // --- The phone (below md; design doc, section 5) ---------------------------------
  // The layout is CSS; these are the phone's own controls. One window shows at
  // a time (the live page, or a folder sheet on top of it), so Home puts every
  // window away and goes to the home screen, keeping them in Open programs.
  /** Home on a phone: every window put away, the address the home screen. */
  const goHome = useCallback((): boolean => {
    setSwitcherOpen(false);
    if (liveKey && !mayLeave(liveKey)) return false;
    if (liveKey) captureLive();
    for (const w of wm.windows) {
      if (!w.minimized) dispatch({ type: "minimize", id: w.id });
    }
    if (liveKey) {
      resumeKey.current = null;
      setTarget(null);
      // An entry of its own: Back from the home screen goes back into the
      // program the member left.
      startNav(() => router.push("/"));
    }
    return true;
  }, [captureLive, liveKey, mayLeave, router, wm.windows]);

  const toggleToday = useCallback(() => {
    setSwitcherOpen(false);
    // The Today body is the home screen's page: from a program, go home.
    if (!page) {
      setTodayOpen((open) => !open);
      return;
    }
    if (goHome()) setTodayOpen(true);
  }, [goHome, page]);

  // The soft keyboard is up: the bottom bar steps aside so nothing fixed
  // rides over the focused field (visual-language doc, section 9). An event,
  // not a poll.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () =>
      setKeyboard(onPhoneNow() && window.innerHeight - vv.height > 150);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // A Back on a phone (the browser's, Android's, a swipe) that lands on
  // another window's page closes the window it left, so background windows
  // do not pile up. It cannot be asked about: a page with unsaved input kept
  // its draft (useWindowDirty) and gets it back when reopened.
  const committed = useRef({ liveKey, url });
  useEffect(() => {
    committed.current = { liveKey, url };
  });
  const poppedFrom = useRef<string | null>(null);
  useEffect(() => {
    const onPop = () => {
      const was = committed.current;
      const now = `${window.location.pathname}${window.location.search}`;
      poppedFrom.current =
        onPhoneNow() && was.liveKey && now !== was.url ? was.liveKey : null;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const from = poppedFrom.current;
    if (from === null) return;
    poppedFrom.current = null;
    if (from === liveKey) return;
    copies.current!.drop(from);
    scrollTops.current.delete(from);
    dispatch({ type: "close", id: from });
  }, [liveKey, url]);

  // --- The screen's size ------------------------------------------------------------
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const vp = { width, height };
      setViewport((old) =>
        old.width === width && old.height === height ? old : vp,
      );
      dispatch({ type: "reclamp", viewport: vp });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [held]);

  // --- The stack, kept for this tab (layout only) -----------------------------------
  const storageKey = windowStorageKey(userId);
  const [restored, setRestored] = useState(false);
  const isFolderKey = useCallback(
    (key: string) => allowed.has(key) && !programs.has(key),
    [allowed, programs],
  );
  useEffect(() => {
    if (restored || held) return;
    let saved: OsWindow<string>[] = [];
    try {
      forgetOtherMembers(window.sessionStorage, userId);
      const parsed = parseWindows(
        window.sessionStorage.getItem(storageKey),
        mode,
        isFolderKey,
      );
      saved = parsed.windows;
      for (const [k, v] of parsed.scrollTops) scrollTops.current.set(k, v);
    } catch {
      // Storage refused (a private window): start with the page alone.
    }
    const measured = layer.current?.getBoundingClientRect();
    const vp =
      measured && measured.width > 0
        ? { width: measured.width, height: measured.height }
        : viewport;
    dispatch({ type: "restore", saved, liveKey, viewport: vp });
    dispatch({
      type: "pruneTo",
      allowed: [
        ...allowed,
        ...(liveKey && page ? [windowProgram(page.programId, liveKey)] : []),
      ],
    });
    setRestored(true);
  }, [
    allowed,
    held,
    isFolderKey,
    liveKey,
    mode,
    page,
    restored,
    storageKey,
    userId,
    viewport,
  ]);

  useEffect(() => {
    if (!restored || held) return;
    try {
      window.sessionStorage.setItem(
        storageKey,
        serializeWindows(wm.windows, mode, scrollTops.current),
      );
    } catch {
      // Not kept; the desktop still works.
    }
  }, [held, mode, restored, storageKey, wm.windows]);

  // --- A new manifest: drop what the member may no longer open ----------------------
  // The version changes only when what the member may open changes (a
  // demotion, a new team, the mode), never with a count (lib/programs.ts).
  const version = useRef(manifest.version);
  useEffect(() => {
    if (version.current === manifest.version) return;
    version.current = manifest.version;
    // A demotion must never leave a copy of a page the member lost, nor a
    // draft typed into one.
    copies.current!.clear();
    keptDrafts.clear();
    copiesChanged();
    const programIds = [...programIndex(manifest).keys()];
    const next = pruneLayout(layout, {
      desktopKeys: desktopEntries(manifest, { cells: {}, items: [] }).map(
        (e) => e.key,
      ),
      programIds,
    });
    setLayout(next);
    const allowedNow = new Set([
      ...allowedWindowPrograms(manifest, next),
      ...(page && liveKey ? [windowProgram(page.programId, liveKey)] : []),
    ]);
    // The windows about to go take their drafts in this tab's storage with
    // them, as a close does: text typed into an editor the member can no
    // longer open is not kept for if access comes back.
    for (const w of wm.windows) {
      const kept =
        allowedNow.has(w.program ?? w.id) &&
        (w.child === undefined || allowedNow.has(w.child));
      if (kept) continue;
      try {
        forgetWindowDrafts(window.sessionStorage, userId, w.id);
      } catch {
        // Storage refused; nothing was kept there.
      }
    }
    dispatch({ type: "pruneTo", allowed: allowedNow });
  }, [keptDrafts, layout, liveKey, manifest, page, userId, wm.windows]);

  // A different member on this tab (a sign-in as someone else): nothing of
  // the last one's is kept.
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    copies.current!.clear();
    keptDrafts.clear();
    scrollTops.current.clear();
    copiesChanged();
    setLayout(savedLayout);
  }, [keptDrafts, savedLayout, userId]);

  // --- Held: the form on top, nothing live behind it ----------------------------------
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  // The page moves from its window into the blocking layer when the hold
  // begins, so its <HeldScreen> mounts again: `hold` for the same address
  // does nothing the second time.
  const signals = useMemo<DesktopSignals>(
    () => ({
      open: (href) => openHrefRef.current(href),
      closeLive: () => closeLiveRef.current(),
      effect: catEffect,
      hold: () => {
        if (heldOn === pathname) return;
        setHeldOn(pathname);
        setMenu(null);
        setNameDialog(null);
        copies.current!.clear();
        copiesChanged();
        // The layout still draws the desktop it drew before the hold; ask
        // the server for the held one.
        if (mode !== "held") router.refresh();
      },
    }),
    [catEffect, heldOn, mode, pathname, router],
  );

  // --- Back and forward: check the gate again before showing a cached page ------------
  const [checking, setChecking] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const refreshStarted = useRef(false);
  useEffect(() => {
    const onPop = () => {
      // Only a real move through history: a fragment link on this page
      // (Skip to window) fires popstate too, and must not hide the page it
      // is focusing, nor cost a server round trip.
      const now = `${window.location.pathname}${window.location.search}`;
      if (now === committed.current.url) return;
      refreshStarted.current = false;
      setChecking(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!checking) return;
    if (!refreshStarted.current) {
      refreshStarted.current = true;
      // The router restored this page from its cache without asking the
      // server. Keep it hidden until a refresh has run its gate again: a
      // member who lost access never sees the cached page.
      startRefresh(() => router.refresh());
    } else if (!refreshing) {
      setChecking(false);
    }
  }, [checking, refreshing, router, url]);

  // --- Coming back to a stale tab --------------------------------------------------
  // Also: while the tab is hidden, every decorative animation on the desktop
  // is paused (`data-os-paused`, styles.css), so a background tab costs
  // nothing (design doc, section 8).
  useEffect(() => {
    let hiddenAt = 0;
    const desk = document.getElementById("os-desktop");
    desk?.toggleAttribute(
      "data-os-paused",
      document.visibilityState === "hidden",
    );
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      desk?.toggleAttribute("data-os-paused", hidden);
      if (hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt >= STALE_AFTER_MS) {
        hiddenAt = 0;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  // --- After each new page: focus, scroll, a copy, and a refused page -----------------
  // The address a page last took focus for. It starts at the first page:
  // a hard load leaves focus where the browser puts it.
  const focusedFor = useRef(pathname);
  const refreshedLockFor = useRef<string | null>(null);
  useEffect(() => {
    const arrived = focusedFor.current !== pathname;
    focusedFor.current = pathname;
    const frame = requestAnimationFrame(() => {
      const body = liveBody(liveKey);
      // A close that left no window: on arriving at the desktop, focus goes
      // to the closed program's icon, not <body>. Read only on an arrival (a
      // frame from before the close must not use it up).
      const closedFrom = arrived ? focusIconAfter.current : null;
      if (arrived) focusIconAfter.current = null;
      if (!body) {
        resumeKey.current = null;
        if (closedFrom) focusIconOfRef.current(closedFrom);
        return;
      }
      if (resumeKey.current === liveKey) {
        const saved = scrollTops.current.get(liveKey!);
        if (saved) body.scrollTop = saved;
      }
      resumeKey.current = null;
      if (!arrived) return;
      // Focus to the new page's heading, unless the page already put it
      // somewhere inside itself (an autofocused field).
      if (body.contains(document.activeElement)) return;
      const heading =
        body.querySelector<HTMLElement>("[data-autofocus]") ??
        body.querySelector<HTMLElement>("h1");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) {
        heading.tabIndex = -1;
        // A heading is a place to start reading, not a control: no ring.
        heading.classList.add("outline-none");
      }
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [liveKey, pathname]);

  // A gate sent the member somewhere other than where the desktop sent them
  // (an approval taken back, a blocking questionnaire): what they may open
  // may have changed under them, so the manifest catches up, and with it the
  // copies and windows they lost (the plan's "a gate redirect").
  const heldNow = useRef(held);
  useEffect(() => {
    heldNow.current = held;
  });
  const arrivedAt = useRef(pathname);
  useEffect(() => {
    // Only on a new address.
    if (arrivedAt.current === pathname) return;
    arrivedAt.current = pathname;
    const sent = sentTo.current;
    if (sent === null) return;
    sentTo.current = null;
    if (sent !== pathname && !heldNow.current) router.refresh();
  }, [pathname, router]);

  useEffect(() => {
    if (held) return;
    // Safari has no requestIdleCallback: a short timeout stands in.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const run = () => {
      const body = liveBody(liveKey);
      if (!body) return;
      // A page the gate refused (a CaptainLock): the member's programs may
      // have changed under them (a demotion by someone else), so the
      // manifest catches up. Once per address.
      if (
        body.querySelector("[data-captain-lock]") &&
        refreshedLockFor.current !== url
      ) {
        refreshedLockFor.current = url;
        router.refresh();
      }
      // A copy while the page is idle, so a switch the page starts itself
      // (a push after a save) still leaves a recent picture.
      captureLive();
    };
    if (hasIdle) {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 300);
    return () => window.clearTimeout(id);
  }, [captureLive, held, liveKey, router, url]);

  // A click on a link in the live window: ask first if it has unsaved input
  // and the link goes to another page, and copy it before it goes.
  useEffect(() => {
    if (held) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // A new tab or window leaves this page where it is.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const body = liveBody(liveKey);
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!body || !link || !body.contains(link)) return;
      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("/") || link.hasAttribute("download")) return;
      if (link.getAttribute("target") === "_blank") return;
      // Any other page unmounts this one, even inside the same window
      // (/profile to /profile/edit); a link to a place on this page does not.
      const to = new URL(href, window.location.href);
      const samePage =
        to.pathname === window.location.pathname &&
        to.search === window.location.search;
      if (!samePage && liveKey && !mayLeave(liveKey)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      captureLive();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [captureLive, held, liveKey, mayLeave]);

  // --- The member's own items and the right-click menus -----------------------------
  const folderList = memberFolders(layout);

  const addToFolderEntries = (
    targetId: string,
    fromShortcut?: string,
  ): ContextMenuEntry[] =>
    folderList.map((f) => ({
      label: `Add to ${f.name}`,
      disabled: f.items.includes(targetId) && !fromShortcut,
      onSelect: () =>
        changeLayout(addToFolder(layout, f.id, targetId, fromShortcut)),
    }));

  const programMenu = (program: ClientProgram): ContextMenuEntry[] => [
    { label: "Open", bold: true, onSelect: () => openProgram(program) },
    // The prototype's rule under "Open", as every desktop menu draws it.
    "divider",
    {
      label: "Create desktop shortcut",
      onSelect: () => changeLayout(addShortcut(layout, program.id).layout),
    },
    ...addToFolderEntries(program.id),
    {
      label: "Add to a new folder",
      onSelect: () => setNameDialog({ kind: "new", addTarget: program.id }),
    },
  ];

  const openEntry = useCallback(
    (entry: DesktopEntry) => {
      if (entry.kind === "program" || entry.kind === "shortcut") {
        openProgram(entry.program);
      } else {
        openFolder(entry.key);
      }
    },
    [openFolder, openProgram],
  );

  const menuFor = (entry: DesktopEntry | undefined): ContextMenuEntry[] => {
    if (!entry) {
      return [
        { label: "New folder", onSelect: () => setNameDialog({ kind: "new" }) },
        {
          label: "Line up icons",
          onSelect: () => changeLayout(lineUpIcons(layout)),
        },
      ];
    }
    switch (entry.kind) {
      case "program":
        return programMenu(entry.program);
      case "folder":
      case "team-folder":
        return [
          { label: "Open", bold: true, onSelect: () => openEntry(entry) },
        ];
      case "member-folder":
        return [
          { label: "Open", bold: true, onSelect: () => openEntry(entry) },
          "divider",
          {
            label: "Rename",
            onSelect: () =>
              setNameDialog({
                kind: "rename",
                id: entry.key,
                name: entry.name,
              }),
          },
          "divider",
          {
            label: "Delete folder",
            danger: true,
            onSelect: () => {
              closeWindow(entry.key);
              changeLayout(removeItem(layout, entry.key));
            },
          },
        ];
      case "shortcut":
        return [
          { label: "Open", bold: true, onSelect: () => openEntry(entry) },
          "divider",
          ...addToFolderEntries(entry.program.id, entry.key),
          "divider",
          {
            label: "Delete shortcut",
            danger: true,
            onSelect: () => changeLayout(removeItem(layout, entry.key)),
          },
        ];
    }
  };

  const onDesktopMenu = (request: DesktopMenuRequest) => {
    const entry = request.key ? entryByKey.get(request.key) : undefined;
    setMenu({
      x: request.x,
      y: request.y,
      entries: menuFor(entry),
      label: entry ? `${iconLabel(entry)} actions` : "Desktop actions",
    });
  };

  /** Right-click (or Shift+F10) on a program inside a folder window. */
  const onFolderMenu = (
    folderKey: string,
    programId: string,
    x: number,
    y: number,
  ) => {
    const program = programs.get(programId);
    if (!program) return;
    const entries = programMenu(program);
    if (isMemberFolderId(folderKey)) {
      entries.push("divider", {
        label: "Remove from this folder",
        onSelect: () =>
          changeLayout(removeFromFolder(layout, folderKey, programId)),
      });
    }
    setMenu({ x, y, entries, label: `${program.label} actions` });
  };

  const onDropIntoFolder = (folderKey: string, key: string) => {
    const entry = entryByKey.get(key);
    if (entry?.kind === "program") {
      changeLayout(addToFolder(layout, folderKey, entry.program.id));
    } else if (entry?.kind === "shortcut") {
      changeLayout(addToFolder(layout, folderKey, entry.program.id, key));
    }
  };

  const saveName = (name: string) => {
    const dialog = nameDialog;
    setNameDialog(null);
    if (!dialog) return;
    if (dialog.kind === "rename") {
      changeLayout(renameFolder(layout, dialog.id, name));
      return;
    }
    const made = addFolder(layout, name);
    changeLayout(
      dialog.addTarget
        ? addToFolder(made.layout, made.id, dialog.addTarget)
        : made.layout,
    );
  };

  // --- Drawing ---------------------------------------------------------------------
  // The icons change only when the entries, the set of open windows or the
  // pending one change, never while a window is dragged (a move per frame):
  // the icon grid's layout is not worked out again for a drag.
  const openIds = wm.windows.map((w) => w.id).join("\n");
  const icons = useMemo<DesktopIconItem[]>(() => {
    const open = new Set(openIds.split("\n"));
    return entries.map((entry): DesktopIconItem => {
      const base = { key: entry.key, label: iconLabel(entry) };
      switch (entry.kind) {
        case "program":
        case "shortcut": {
          const instance = matchProgram(entry.program.href)?.instanceKey;
          return {
            ...base,
            icon: programIcon(entry.program),
            open: !!instance && open.has(instance),
            pending: !!instance && pendingKey === instance,
            droppable: true,
            ...(entry.kind === "shortcut" && { shortcut: true }),
            ...(entry.kind === "program" &&
              entry.program.badge && { badge: entry.program.badge }),
          };
        }
        case "folder": {
          // A camp folder counts what its programs count (the prototype's
          // Captains folder wears System health's number).
          const inside = entry.folder.programs.reduce(
            (sum, p) => sum + (p.badge ?? 0),
            0,
          );
          return {
            ...base,
            icon: folderIcon(open.has(entry.key)),
            open: open.has(entry.key),
            ...(inside > 0 && { badge: inside }),
          };
        }
        case "team-folder":
          // A team you are on is a folder, as the prototype draws it; the
          // team's own picture is on its page inside.
          return {
            ...base,
            icon: folderIcon(open.has(entry.key)),
            open: open.has(entry.key),
            ...(entry.folder.lead && { lead: true }),
          };
        case "member-folder":
          return {
            ...base,
            icon: folderIcon(open.has(entry.key)),
            open: open.has(entry.key),
            count: entry.programs.length,
            acceptsDrop: true,
          };
      }
    });
  }, [entries, openIds, pendingKey]);
  const spec = useMemo(() => desktopSpec(manifest, layout), [manifest, layout]);

  // Today: closed by default, the member's choice kept in this browser (a
  // boolean). On a phone the same body opens as a sheet from the bottom bar.
  const [todayStored, setTodayStored] = useStoredBoolean(
    localStorageBoolean(TODAY_OPEN_KEY),
  );
  const phoneNow = usePhone();

  const titleOf = (w: OsWindow<string>): string => {
    const entry = entryByKey.get(w.id);
    if (entry) return iconLabel(entry);
    if (!w.lastUrl) return "Folder";
    const m = matchProgram(w.lastUrl);
    if (!m) return "Window";
    if (m.programId === "team")
      return programs.get(m.instanceKey)?.label ?? "Team";
    return PROGRAM_TITLES[m.programId];
  };

  const iconOf = (w: OsWindow<string>, className: string): ReactNode => {
    const entry = entryByKey.get(w.id);
    if (entry && entry.kind !== "program" && entry.kind !== "shortcut") {
      const item = icons.find((i) => i.key === w.id);
      return item?.icon(className);
    }
    const m = w.lastUrl ? matchProgram(w.lastUrl) : null;
    const program =
      (m &&
        programs.get(m.programId === "team" ? m.instanceKey : m.programId)) ??
      null;
    return (program ? programIcon(program) : iconFor(m?.programId ?? ""))(
      className,
    );
  };

  // The Teams folder marks the member's own teams, as the prototype does:
  // LEAD on one they lead, MINE on one they are on.
  const ledTeams = new Set(
    manifest.teamFolders.filter((f) => f.lead).map((f) => f.team),
  );
  const teamTag = (program: ClientProgram) => {
    if (!program.id.startsWith("team:")) return {};
    if (ledTeams.has(program.id.slice("team:".length))) {
      return {
        tag: { text: "Lead", spoken: "you lead it", strong: true },
      };
    }
    return program.mine ? { tag: { text: "Mine", spoken: "your team" } } : {};
  };

  /** The old file name's extension, quiet after the title: "Roster .db". */
  const suffixOf = (w: OsWindow<string>): string | undefined => {
    const file = w.lastUrl ? matchProgram(w.lastUrl)?.genericTitle : undefined;
    const dot = file ? file.lastIndexOf(".") : -1;
    return file && dot > 0 ? file.slice(dot).toLowerCase() : undefined;
  };

  const folderBody = (key: string): ReactNode => {
    const entry = entryByKey.get(key);
    let label = "Folder";
    let list: ClientProgram[] = [];
    if (entry?.kind === "folder") {
      label = entry.folder.label;
      list = entry.folder.programs;
    } else if (entry?.kind === "team-folder") {
      label = entry.folder.label;
      list = entry.folder.programs;
    } else if (entry?.kind === "member-folder") {
      label = entry.name;
      list = entry.programs;
    }
    const onMenu = (
      e: ReactMouseEvent | ReactKeyboardEvent,
      x: number,
      y: number,
    ) => {
      const icon = (e.target as Element).closest<HTMLElement>("[data-icon]");
      const id = icon?.dataset.icon;
      if (!id) return;
      e.preventDefault();
      onFolderMenu(key, id, x, y);
    };
    return (
      <div
        className="h-full select-none"
        onContextMenu={(e) => onMenu(e, e.clientX, e.clientY)}
        onKeyDown={(e) => {
          if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
            const r = (e.target as Element).getBoundingClientRect();
            onMenu(e, r.left + 16, r.top + 16);
          }
        }}
      >
        <FolderWindow
          label={label}
          items={list.map((program) => {
            const instance = matchProgram(program.href)?.instanceKey;
            return {
              id: program.id,
              label: program.label,
              icon: programIcon(program),
              open: wm.windows.some((w) => w.id === instance),
              ...(program.badge ? { badge: program.badge } : {}),
              ...(entry?.kind === "folder" && teamTag(program)),
              onOpen: () => openProgram(program),
            };
          })}
          // The Teams folder (every member has it) keeps the camp's art piece
          // at its bottom, with Jinn asleep on it.
          footer={
            entry?.kind === "folder" && entry.folder.id === "teams" ? (
              <TeamsFolderArt onWake={() => openHref(INKBLOT_HREF)} />
            ) : undefined
          }
          empty={
            isMemberFolderId(key)
              ? "Nothing in here yet. Drag an icon onto this folder, or right-click a program and add it."
              : "Nothing in here yet."
          }
        />
      </div>
    );
  };

  const windowLayer = (
    <div
      ref={layer}
      className="pointer-events-none absolute inset-0 isolate z-20"
    >
      {!held &&
        wm.windows.map((w) => {
          const isLive = w.id === liveKey;
          const title = titleOf(w);
          let body: ReactNode;
          if (isLive) {
            body = (
              <>
                {checking && (
                  <p
                    role="status"
                    className="p-6 font-mono text-sm text-os-muted"
                  >
                    Checking…
                  </p>
                )}
                <div
                  id="os-window-content"
                  tabIndex={-1}
                  hidden={checking}
                  className="mx-auto w-full max-w-6xl px-4 py-6 outline-none page-sm:px-6"
                >
                  {children}
                </div>
              </>
            );
          } else if (!w.lastUrl) {
            body = folderBody(w.id);
          } else {
            const copy = w.minimized ? undefined : copies.current!.get(w.id);
            body = (
              <div inert aria-hidden className="h-full">
                {copy ? (
                  <LastSeenView key={copy.takenAt} copy={copy} />
                ) : (
                  <WindowPlaceholder
                    icon={iconOf(w, "size-12")}
                    label={title}
                  />
                )}
              </div>
            );
          }
          return (
            <OsWindowFrame
              key={w.id}
              win={w}
              title={title}
              suffix={suffixOf(w)}
              // Jinn, now and then, over the focused window's top edge.
              decoration={
                w.id === top?.id && !w.maximized ? (
                  <WindowPeek fedAt={fedAt} />
                ) : undefined
              }
              isTop={w.id === top?.id}
              // A frozen copy: no landmark, no tab stops (design doc,
              // section 6). A folder's window stays live.
              background={!isLive && !!w.lastUrl}
              hidden={!!w.minimized}
              phone={false}
              responsive
              // A phone shows one window: the live page, or a folder sheet
              // on top of it. Background copies stay on the desktop only.
              phoneHidden={!(w.id === top?.id && (isLive || !w.lastUrl))}
              autoFocus={!w.lastUrl}
              pending={pendingKey === w.id}
              onFocus={(via) => {
                if (isLive || !w.lastUrl) {
                  dispatch({ type: "focus", id: w.id });
                } else if (via === "pointer") {
                  focusWindow(w);
                }
              }}
              onClose={() => closeWindow(w.id)}
              onMinimize={() => minimizeWindow(w.id)}
              onToggleMaximize={() =>
                dispatch({ type: "toggleMaximize", id: w.id })
              }
              onMove={(x, y) =>
                dispatch({ type: "move", id: w.id, x, y, viewport })
              }
              onResize={(from, edge, dx, dy) =>
                dispatch({
                  type: "resize",
                  id: w.id,
                  from,
                  edge,
                  dx,
                  dy,
                  viewport,
                })
              }
            >
              {body}
            </OsWindowFrame>
          );
        })}
    </div>
  );

  const taskbarWindows = held
    ? []
    : wm.windows.map((w) => ({
        id: w.id,
        label: titleOf(w),
        // "Send questionnaire window": never the same name as a button in
        // the page ("Send questionnaire").
        ariaLabel: `${titleOf(w)} window`,
        minimized: w.minimized,
        icon: (
          <span className={pendingKey === w.id ? "os-pending" : undefined}>
            {iconOf(w, "size-4 shrink-0 text-os-accent")}
          </span>
        ),
      }));

  // The phone's home screen: the same icons, in the desktop's default order,
  // big, and never the member's own shortcuts or folders.
  const iconByKey = new Map(icons.map((i) => [i.key, i] as const));
  const phoneGroups: PhoneGroup[] = homeScreenGroups(manifest).map((g) => ({
    key: g.key,
    label: g.label,
    items: g.keys.flatMap((key) => {
      const icon = iconByKey.get(key);
      if (!icon) return [];
      return [
        {
          ...icon,
          onOpen: () => {
            const entry = entryByKey.get(key);
            if (entry && !held) openEntry(entry);
          },
        },
      ];
    }),
  }));
  const health = manifest.tray.health;
  const phoneNotices = held ? null : (
    <>
      {manifest.tray.balloon === "application_submitted" && (
        <p
          role="status"
          className="border border-os-line bg-os-panel px-3 py-2 text-sm text-os-fg"
        >
          {APPLICATION_SUBMITTED}
        </p>
      )}
    </>
  );
  // On a phone a program (or a folder sheet, or Open programs) covers the
  // home screen whole: it leaves the Tab order and the accessibility tree,
  // so both see one live window (design doc, section 6). The Today sheet
  // covers only part of it, and leaves it be.
  const phoneCovered =
    held || switcherOpen || !!page || (!!top && !top.minimized && !top.lastUrl);
  // Nobody can see the CRT surface or the wordmark: a blocking form over
  // everything, a maximised window over the desktop, or on a phone a program
  // or sheet over the home screen. Their loops hold still (data-os-paused),
  // so a covered desktop costs what a hidden tab does.
  const decorCovered =
    held ||
    (phoneNow ? phoneCovered : !!top && !top.minimized && !!top.maximized);
  // Prince sleeps on the clock, just above the bar, at the screen's right.
  // Wherever a window, the Today panel or a phone program reaches down to
  // him there, he lets taps through to it rather than take them.
  const princeCovered = phoneNow
    ? phoneCovered || todayOpen
    : (todayStored && !!today) ||
      wm.windows.some(
        (w) =>
          !w.minimized &&
          (w.maximized ||
            (w.x + w.w > viewport.width - 56 &&
              w.y + w.h > viewport.height - 32)),
      );
  const princeClass = princeCovered ? "pointer-events-none" : "";
  const switcherRows = [...wm.windows]
    .sort((a, b) => b.z - a.z)
    .map((w) => ({
      id: w.id,
      label: titleOf(w),
      icon: iconOf(w, "size-5 shrink-0"),
      current:
        w.id === top?.id && !w.minimized && (w.id === liveKey || !w.lastUrl),
    }));

  // Held, on a page other than the form or its completion page: the two
  // pages that gate on camp access alone (the inbox and an announcement, from
  // a push or email link) render bare, as they did before the desktop, with
  // the inbox's own link to the form. Every other member page is sent to the
  // form by its server gate. The blocking layer holds only the form.
  if (mode === "held" && page?.programId !== "questionnaire") {
    return (
      <div data-os-skin className={HELD_BARE}>
        {children}
      </div>
    );
  }

  return (
    <DesktopSignalsContext.Provider value={signals}>
      <div
        id="os-desktop"
        data-os-skin
        inert={held || undefined}
        data-os-keyboard={keyboard || undefined}
        // --os-phone-bar: the bottom bar's height, where a phone's windows
        // and sheets stop; nothing while the soft keyboard is up.
        className={`fixed inset-0 flex select-none flex-col overflow-hidden bg-os-bg text-os-fg ${
          keyboard
            ? "[--os-phone-bar:0px]"
            : "[--os-phone-bar:calc(3.5rem+max(0.25rem,env(safe-area-inset-bottom)))]"
        }`}
      >
        {/* The CRT surface under everything: grid, scanlines, noise, beam. */}
        <div data-os-paused={decorCovered || undefined} className="contents">
          <Surface />
        </div>
        {page && !held && (
          <a
            href="#os-window-content"
            onClick={(e) => {
              // Focus the live window's page without moving through
              // history: the fragment would fire popstate.
              const target = document.getElementById("os-window-content");
              if (!target) return;
              e.preventDefault();
              target.focus();
            }}
            className="sr-only z-[100] bg-os-primary px-3 py-2 text-os-bg focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
          >
            Skip to window
          </a>
        )}
        {/* Held, the header stays drawn behind the form, inert with the rest
            of the desktop, as the prototype's locked desktop. */}
        <DesktopHeader
          account={account}
          onOpenAccount={() => openHref("/profile")}
          pins={
            !held && manifest.pins && pins.length > 0 ? (
              <PinnedStrip pins={pins} />
            ) : undefined
          }
          phoneTray={
            !held && health?.status === "warning" ? (
              <HealthItem health={health} onOpenHref={openHref} />
            ) : undefined
          }
        />
        <div className="relative min-h-0 flex-1">
          {/* The wallpaper: the wordmark and the year, centred. */}
          <div
            aria-hidden
            data-os-paused={decorCovered || undefined}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 max-md:hidden"
          >
            <GlitchWordmark text="404 OS" size="clamp(3rem, 7vw, 5.5rem)" />
            {tagline && (
              <p
                data-label={tagline}
                className="os-chromatic font-mono text-[11px] uppercase tracking-[0.3em] text-os-fg after:content-[attr(data-label)]"
              />
            )}
          </div>
          <DesktopIcons
            className="absolute inset-0 max-md:hidden"
            items={icons}
            spec={spec}
            cells={layout.cells}
            onCellsChange={(cells) => changeLayout(withCells(layout, cells))}
            onOpen={(key) => {
              const entry = entryByKey.get(key);
              if (entry && !held) openEntry(entry);
            }}
            onDropIntoFolder={onDropIntoFolder}
            onContextMenu={held ? undefined : onDesktopMenu}
          />
          <PhoneHome
            groups={phoneGroups}
            notices={phoneNotices}
            tagline={`${account.rank} console${year ? ` · Burn ${year}` : ""}`}
            covered={phoneCovered}
          />
          {/* The desktop's own page (/): its heading, nothing to see. */}
          {!page && !held && children}
          {windowLayer}
          {/* Today: shut until its handle is pulled; it slides in over the
              windows, on every screen (the prototype's pop-out). */}
          {!held && today && (
            <TodayGadget
              open={todayStored && !phoneNow}
              onOpenChange={setTodayStored}
              count={today.count}
              clearTitleBar={!!top?.maximized}
              className="absolute bottom-2 right-0 top-3 z-30 max-md:hidden"
            >
              {today.body}
            </TodayGadget>
          )}
        </div>
        <div
          aria-hidden
          className="h-10 shrink-0 max-md:h-[var(--os-phone-bar)]"
        />
        {held ? (
          <EmptyTaskbar />
        ) : (
          <>
            <PhoneBar
              hidden={keyboard}
              openCount={wm.windows.length}
              switcherOpen={switcherOpen}
              todayOpen={todayOpen && !page}
              todayCount={today?.count}
              onHome={() => {
                setTodayOpen(false);
                goHome();
              }}
              onSwitcher={() => {
                setTodayOpen(false);
                setSwitcherOpen((open) => !open);
              }}
              onToday={toggleToday}
              bell={
                manifest.tray.inbox ? (
                  <NotificationPanel
                    count={manifest.tray.inbox.count}
                    {...TRAY_BELL}
                    triggerClassName="relative grid h-12 w-full place-items-center text-os-fg outline-none hover:text-os-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-os-fg"
                    pinned={
                      manifest.pins && pins.length > 0
                        ? (close) => (
                            <PinnedList pins={pins} onNavigate={close} />
                          )
                        : undefined
                    }
                  />
                ) : null
              }
              clock={
                <PhoneClock
                  burn={burn}
                  decoration={
                    <ClockPrince className={`right-2 ${princeClass}`} />
                  }
                />
              }
            />
            {switcherOpen && (
              <PhoneSheet
                title="Open programs"
                onClose={() => setSwitcherOpen(false)}
              >
                <PhoneSwitcher
                  rows={switcherRows}
                  onPick={(id) => {
                    setSwitcherOpen(false);
                    const w = wm.windows.find((x) => x.id === id);
                    if (w) focusWindow(w);
                  }}
                  onCloseWindow={(id) => {
                    if (id === liveKey && !mayLeave(id)) return;
                    closeWindow(id);
                  }}
                />
              </PhoneSheet>
            )}
            {phoneNow && todayOpen && !page && today && (
              // The whole screen above the bar, the gadget boxed inside it,
              // as the prototype's phone draws Today.
              <PhoneSheet title="Today" onClose={() => setTodayOpen(false)}>
                <div className="p-2">
                  <div className="border border-os-line">{today.body}</div>
                </div>
              </PhoneSheet>
            )}
            <div className="max-md:hidden">
              <DesktopTaskbar
                manifest={manifest}
                windows={taskbarWindows}
                topId={top?.id}
                onToggleWindow={toggleFromTaskbar}
                onOpenProgram={openProgram}
                onOpenFolder={openFolder}
                account={account}
                headcount={headcount}
                burn={burn}
                year={year}
                clockDecoration={<ClockPrince className={princeClass} />}
                onOpenHref={openHref}
                onTidyWindows={() => dispatch({ type: "tidy", viewport })}
                onLineUpIcons={() => changeLayout(lineUpIcons(layout))}
                onShowDesktop={showDesktop}
              />
            </div>
          </>
        )}
        <ContextMenu menu={held ? null : menu} onClose={() => setMenu(null)} />
        <FolderNameDialog
          open={!held && nameDialog !== null}
          fresh={nameDialog?.kind === "new"}
          name={nameDialog?.kind === "rename" ? nameDialog.name : ""}
          onSave={saveName}
          onCancel={() => setNameDialog(null)}
        />
      </div>
      {held && (
        <BlockingLayer
          title="Required form"
          // Named by the form's own title ("Tent check, dialog"), then its
          // completion page's.
          nameFromHeading
          signOut={
            <SignOutLink className="font-semibold text-os-muted hover:text-os-fg" />
          }
        >
          {children}
        </BlockingLayer>
      )}
      {/* The secret keys open the Terminal's game, which only the full
          desktop has: an applicant waiting for approval gets none. */}
      {mode === "full" && !held && (
        <DesktopSecrets
          paws={paws}
          onKonami={() => openHref(INKBLOT_HREF)}
          onMeow={togglePaws}
        />
      )}
      {boot && !held && (
        <ConsoleBoot lines={boot.lines} welcome={boot.welcome} />
      )}
    </DesktopSignalsContext.Provider>
  );
}

/** An icon's plain name. */
function iconLabel(entry: DesktopEntry): string {
  switch (entry.kind) {
    case "program":
    case "shortcut":
      return entry.program.label;
    case "folder":
    case "team-folder":
      return entry.folder.label;
    case "member-folder":
      return entry.name;
  }
}
