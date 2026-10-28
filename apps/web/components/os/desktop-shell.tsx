"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BlockingLayer,
  ContextMenu,
  DesktopIcons,
  FolderNameDialog,
  FolderWindow,
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
  removeFromFolder,
  removeItem,
  renameFolder,
  topWindow,
  useKeptDrafts,
  useLeaveGuard,
  usePhone,
  useStoredBoolean,
  withCells,
  type ContextMenuEntry,
  type ContextMenuState,
  type DesktopIconItem,
  type DesktopLayout,
  type DesktopMenuRequest,
  type LastSeenCopy,
  type OsWindow,
  type Viewport,
} from "@camp404/os";
import {
  defaultDesktopPreferences,
  type DesktopPreferences,
} from "@camp404/types/desktop-preferences";
import { toast } from "@camp404/ui/components/toast";
import { saveDesktopLayoutAction } from "@/app/(console)/desktop-layout-actions";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import type {
  ClientProgram,
  ManifestMode,
  ProgramManifest,
} from "@/lib/programs";
import { PROGRAM_TITLES, matchProgram } from "@/lib/program-routes";
import {
  allowedWindowPrograms,
  desktopEntries,
  desktopSpec,
  homeScreenGroups,
  memberFolders,
  programIndex,
  type DesktopEntry,
} from "./desktop-items";
import {
  FIRST_VIEWPORT,
  POP_SETTLE_MS,
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
  openPageAction,
  reduceWindows,
  refusedPageRefresh,
  restoreActions,
  phoneBackFrom,
  type DesktopContext,
  type DesktopEvent,
  type Plan,
} from "./desktop-controller";
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
  PhoneVoiceCell,
  type PhoneGroup,
  PhoneClock,
} from "./phone-chrome";
import { PinnedList, PinnedStrip, type PinnedItem } from "./pinned-strip";
import { ProgramSearch } from "./program-search";
import { folderIcon, iconFor, programIcon } from "./program-icons";
import { ConsoleBoot } from "./console-boot";
import {
  DesktopDisplayContext,
  OS_SUBLINE,
  OsWordmark,
  displayAttributes,
  useDesktopDisplay,
  useDisplayState,
} from "./desktop-display";
import { WelcomeWizard } from "./welcome-wizard";
import {
  PayGuideOverlay,
  PayGuideProvider,
  type PayGuideData,
} from "@/components/dues/pay-guide";
import { DesktopVoice, PhoneVoiceSheet } from "@/components/voice/voice-lazy";
import { useVoiceCommand } from "@/components/voice/use-voice-command";
import {
  ClockPrince,
  ClockReunion,
  DesktopSecrets,
  TeamsFolderArt,
  WindowCats,
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

/** How long the desktop waits after the last icon move before it saves. */
const SAVE_LAYOUT_AFTER_MS = 800;
/** A held member's page that is not the form: the content column, no desktop. */
const HELD_BARE = "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6";

/** The last-seen copies the windows draw, by window key. */
type CopyView = ReadonlyMap<string, LastSeenCopy>;
type CopyChange =
  | "clear"
  | { set?: [key: string, copy: LastSeenCopy]; drop: readonly string[] };
const NO_COPIES: CopyView = new Map();

function applyCopyChange(view: CopyView, change: CopyChange): CopyView {
  if (change === "clear") return view.size === 0 ? view : NO_COPIES;
  const next = new Map(view);
  for (const key of change.drop) next.delete(key);
  if (change.set) next.set(...change.set);
  return next;
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
  today?: {
    count: number;
    body: ReactNode;
    /** Rendered always (nothing visible): Today's background first read. */
    warm?: ReactNode;
  } | null;
  /**
   * The boot screen's lines, when it plays: once per browser session, never
   * in tests (the layout decides). Null for no boot.
   */
  boot?: { lines: readonly BootLine[]; welcome: string } | null;
  /**
   * The member's display preferences (issues #289 and #290): the theme and
   * switches the desktop root wears from the first paint, one-click opening,
   * and whether the welcome wizard has been closed before.
   */
  preferences?: DesktopPreferences;
  /**
   * This member sees Prince come home instead of asleep on the clock
   * (lib/prince-keeper.ts decides on the server). A yes or no only.
   */
  princeKeeper?: boolean;
  /**
   * The welcome wizard offers Ol' Jeb (the camp's Telegram bot) as an
   * optional step: he is set up and this member has not connected him.
   */
  telegramOffer?: boolean;
  /**
   * The pay guide's figures (components/dues/pay-guide.tsx): the member's
   * next fee payment, their reference and the camp's bank details, only when
   * the year is collecting fees, they owe and asked for no subsidy. Drawn on a
   * full desktop only, outside every window: never over a blocking form, never
   * on the held desktop and never in a frozen copy. Not part of the manifest.
   */
  payGuide?: PayGuideData | null;
  /**
   * How long the clock stays empty before she walks on, in ms. Unset: the
   * scene's own 30 s. Only the E2E harness shortens it.
   */
  reunionDelayMs?: number;
  /**
   * How long a program's window stays open before two more cats turn up
   * under it, in ms. Unset: the games package's own 1.5 minutes. Only the
   * E2E harness shortens it (lib/camp-cats.ts).
   */
  catsDelayMs?: number;
  children: ReactNode;
}

/**
 * No preferences given (a test's desktop): the defaults, with the welcome
 * counted as seen, so it does not open by itself. The console layout always
 * passes the member's own.
 */
const SEEN_DEFAULTS: DesktopPreferences = {
  ...defaultDesktopPreferences(),
  welcomeSeenAt: "2000-01-01T00:00:00.000Z",
};

/** The desktop. Wraps the dirty registry every window's guard reads. */
export function Desktop(props: DesktopProps) {
  // The wizard opens by itself on a full desktop the member has not closed
  // it on before (never on the restricted or held one).
  const preferences = props.preferences ?? SEEN_DEFAULTS;
  const display = useDisplayState(preferences, props.mode === "full");
  return (
    <WindowDirtyProvider>
      <DraftOwnerContext.Provider value={props.userId}>
        <DesktopDisplayContext.Provider value={display}>
          <PayGuideProvider
            data={props.mode === "full" ? (props.payGuide ?? null) : null}
          >
            <DesktopInner {...props} />
          </PayGuideProvider>
        </DesktopDisplayContext.Provider>
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
  princeKeeper = false,
  telegramOffer = false,
  reunionDelayMs,
  catsDelayMs,
  children,
}: DesktopProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = search ? `${pathname}?${search}` : pathname;
  const page = livePage(pathname);
  const liveKey = page?.instanceKey ?? null;
  const mayLeave = useLeaveGuard();
  const keptDrafts = useKeptDrafts();
  // The theme, the switches and the wizard (desktop-display.tsx).
  const display = useDesktopDisplay()!;
  const { effects } = display;
  const effectsOff = display.prefs.effectsOff;

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
    // No prints under reduced motion or Effects off, so nothing to announce.
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.getElementById("os-desktop")?.dataset.osEffects === "off"
    ) {
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
  // The phone's sheets (Today, and a captain's Voice) and its soft keyboard.
  const [todayOpen, setTodayOpen] = useState(false);
  const [phoneVoiceOpen, setPhoneVoiceOpen] = useState(false);
  // Ctrl+K program search (program-search.tsx), on every screen.
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const layer = useRef<HTMLDivElement>(null);

  // The page's own requests (the Terminal's open and exit), through refs so
  // the signals context stays the same object while windows come and go.
  const openHrefRef = useRef<(href: string) => void>(() => {});
  const closeLiveRef = useRef<() => void>(() => {});

  // --- Windows ---------------------------------------------------------------------
  // The window stack moves only through the controller's reducer
  // (desktop-controller.ts); what an event does to it is the controller's
  // plan, run below.
  const [wm, dispatch] = useReducer(reduceWindows, INITIAL_WM, (initial) =>
    initialWindows(initial, page, url, mode === "held"),
  );
  // A window the member closed while it was the live one: its address is
  // still the URL until the replace lands, and it must not open again.
  const [closing, setClosing] = useState<string | null>(null);
  // A new address opens or raises its window in the same render, so the page
  // never paints for a moment inside the window it is leaving. (Adjusting
  // state while rendering, compared with the address last seen.)
  const [seenUrl, setSeenUrl] = useState(url);
  const liveMissing = liveWindowMissing({ state: wm, page, held, closing });
  if (seenUrl !== url || liveMissing) {
    if (seenUrl !== url) {
      setSeenUrl(url);
      setClosing(null);
      // A new page on a phone: the sheets over the old one go, and Today
      // stays open only on the home screen, where its body is.
      if (pathname !== "/") setTodayOpen(false);
    }
    const open = held ? null : openPageAction(page, url, viewport);
    if (open) dispatch(open);
  }
  const top = topWindow(wm);

  // --- Last-seen copies (memory only) ---------------------------------------------
  // The store keeps the copies within their budget; `copyView` is what the
  // windows draw, changed alongside it on every put, drop and clear.
  const copies = useRef<LastSeenStore>(null);
  if (copies.current === null) copies.current = new LastSeenStore();
  const [copyView, changeCopyView] = useReducer(applyCopyChange, NO_COPIES);
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
    if (copy) {
      const evicted = store.put(liveKey, copy);
      const kept = store.get(liveKey);
      changeCopyView(
        kept
          ? { set: [liveKey, kept], drop: evicted }
          : { drop: [liveKey, ...evicted] },
      );
    } else {
      store.drop(liveKey);
      changeCopyView({ drop: [liveKey] });
    }
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

  // Where the desktop last sent the member, to tell when a gate redirected
  // them somewhere else (their access may have changed).
  const sentTo = useRef<string | null>(null);
  // The window a click opened before its page arrived, until the
  // navigation settles.
  const preOpened = useRef<string | null>(null);
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

  /** Run a controller plan's effects, in order. False when the guard said no. */
  const run = useCallback(
    (plan: Plan): boolean => {
      for (const effect of plan.effects) {
        switch (effect.kind) {
          case "wm":
            dispatch(effect.action);
            break;
          case "capture":
            captureLive();
            break;
          case "push":
            startNav(() => router.push(effect.href as Route));
            break;
          case "replace":
            router.replace(effect.href as Route);
            break;
          case "refresh":
            router.refresh();
            break;
          case "resume":
            resumeKey.current = effect.key;
            break;
          case "pending":
            setTarget(effect.key);
            break;
          case "sentTo":
            sentTo.current = effect.path;
            break;
          case "preOpened":
            preOpened.current = effect.key;
            break;
          case "closing":
            setClosing(effect.id);
            break;
          case "focusIconAfter":
            focusIconAfter.current = effect.key;
            break;
          case "dropCopy":
            copies.current!.drop(effect.id);
            changeCopyView({ drop: [effect.id] });
            scrollTops.current.delete(effect.id);
            break;
          case "forgetDrafts":
            keptDrafts.drop(effect.id);
            try {
              forgetWindowDrafts(window.sessionStorage, userId, effect.id);
            } catch {
              // Storage refused; nothing was kept there.
            }
            break;
          case "focusAfterClose": {
            const id = effect.id;
            requestAnimationFrame(() => {
              const nextTop = document.querySelector<HTMLElement>(
                "#os-desktop [data-top]",
              );
              if (nextTop) nextTop.focus({ preventScroll: true });
              else focusIconOfRef.current(id);
            });
            break;
          }
          case "focusTask": {
            const id = effect.id;
            requestAnimationFrame(() => {
              for (const el of document.querySelectorAll<HTMLElement>(
                "[data-task]",
              )) {
                if (el.dataset.task === id) el.focus({ preventScroll: true });
              }
            });
            break;
          }
        }
      }
      return !plan.refused;
    },
    [captureLive, keptDrafts, router, userId],
  );

  /** What the controller reads of this render, at the moment of the event. */
  const context = useCallback(
    (): DesktopContext => ({
      liveKey,
      viewport,
      preOpened: preOpened.current,
      base: window.location.href,
      onPhone: onPhoneNow,
      mayLeave,
    }),
    [liveKey, mayLeave, viewport],
  );
  /** Answer an event with the controller's plan, and run it. */
  const send = useCallback(
    (event: DesktopEvent): boolean => run(decide(wm, event, context())),
    [context, run, wm],
  );

  // A window opened ahead of its page that the page never reached goes; once
  // the page has been live in it, it is an ordinary window.
  useEffect(() => {
    if (!preOpened.current) return;
    send({ type: "settlePreOpened", navigating });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settles on a new live window or the end of a navigation only, as before the controller
  }, [liveKey, navigating]);

  const openHref = useCallback(
    (href: string) => void send({ type: "openHref", href }),
    [send],
  );
  const openProgram = useCallback(
    (program: ClientProgram) => openHref(program.href),
    [openHref],
  );
  const openSearchEntry = useCallback(
    (href: string) => void send({ type: "openSearchEntry", href }),
    [send],
  );
  const openFolder = useCallback(
    (key: string) => void send({ type: "openFolder", key }),
    [send],
  );
  const focusWindow = useCallback(
    (w: OsWindow<string>) => void send({ type: "focusWindow", id: w.id }),
    [send],
  );
  const closeWindow = useCallback(
    (id: string) => void send({ type: "close", id }),
    [send],
  );
  const showDesktop = useCallback(
    () => void send({ type: "showDesktop" }),
    [send],
  );

  // What a page inside a window may ask of the desktop (the Terminal).
  useEffect(() => {
    openHrefRef.current = openHref;
    closeLiveRef.current = () => void send({ type: "closeLive" });
  });

  const toggleFromTaskbar = useCallback(
    (id: string) => void send({ type: "taskbarToggle", id }),
    [send],
  );

  // --- The phone (below md; design doc, section 5) ---------------------------------
  // The layout is CSS; these are the phone's own controls. One window shows at
  // a time (the live page, or a folder sheet on top of it), so Home puts every
  // window away and goes to the home screen, where an open program's icon
  // glows and brings its window back.
  // --- Voice (#356): a captain's only -----------------------------------------------
  // The manifest carries `voice` for a captain on the full desktop and for
  // nobody else, so nobody else has a mic in the page at all.
  const voiceOn = !!manifest.voice && mode === "full" && !held;
  const voice = useVoiceCommand({
    consented: manifest.voice?.consented ?? false,
  });
  const closePhoneVoice = useCallback(() => {
    setPhoneVoiceOpen(false);
    voice.reset();
  }, [voice]);

  /** Home on a phone: every window put away, the address the home screen. */
  const goHome = useCallback((): boolean => send({ type: "goHome" }), [send]);

  const toggleToday = useCallback(() => {
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
  // another window's page closes the window it left (the controller's
  // phoneBack). It cannot be asked about.
  const committed = useRef({ liveKey, url });
  useEffect(() => {
    committed.current = { liveKey, url };
  });
  const poppedFrom = useRef<string | null>(null);
  useEffect(() => {
    const onPop = () => {
      const was = committed.current;
      poppedFrom.current = phoneBackFrom({
        phone: onPhoneNow(),
        liveKey: was.liveKey,
        url: was.url,
        now: `${window.location.pathname}${window.location.search}`,
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const from = poppedFrom.current;
    if (from === null) return;
    poppedFrom.current = null;
    send({ type: "phoneBack", from });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the popped page has arrived, as before the controller
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
  // Restored once: nothing is drawn from it, so it is a ref. The stack is
  // saved only after the restore has read what this tab kept.
  const restored = useRef(false);
  const isFolderKey = useCallback(
    (key: string) => allowed.has(key) && !programs.has(key),
    [allowed, programs],
  );
  // A layout effect: the live window takes its place on the measured screen
  // in the same commit as hydration, so it never grows under a first click.
  useLayoutEffect(() => {
    if (restored.current || held) return;
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
    for (const action of restoreActions({
      saved,
      liveKey,
      page,
      viewport: vp,
      allowed,
    })) {
      dispatch(action);
    }
    restored.current = true;
  }, [
    allowed,
    held,
    isFolderKey,
    liveKey,
    mode,
    page,
    storageKey,
    userId,
    viewport,
  ]);

  useEffect(() => {
    if (!restored.current || held) return;
    try {
      window.sessionStorage.setItem(
        storageKey,
        serializeWindows(wm.windows, mode, scrollTops.current),
      );
    } catch {
      // Not kept; the desktop still works.
    }
  }, [held, mode, storageKey, wm.windows]);

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
    changeCopyView("clear");
    const change = manifestChanged({
      state: wm,
      manifest,
      layout,
      page,
      liveKey,
    });
    setLayout(change.layout);
    // The windows about to go take their drafts in this tab's storage with
    // them, as a close does.
    for (const id of change.forget) {
      try {
        forgetWindowDrafts(window.sessionStorage, userId, id);
      } catch {
        // Storage refused; nothing was kept there.
      }
    }
    dispatch(change.prune);
  }, [keptDrafts, layout, liveKey, manifest, page, userId, wm]);

  // A different member on this tab (a sign-in as someone else): nothing of
  // the last one's is kept.
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    copies.current!.clear();
    keptDrafts.clear();
    scrollTops.current.clear();
    changeCopyView("clear");
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
        changeCopyView("clear");
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
  // Where Back or Forward is going. The refresh waits until the router has
  // moved there: a refresh started before the move re-rendered the page being
  // left, then the move fetched the destination too (two server trips, the
  // window hidden for both).
  const poppedTo = useRef<string | null>(null);
  useEffect(() => {
    const onPop = () => {
      // Only a real move through history: a fragment link on this page
      // (Skip to window) fires popstate too, and must not hide the page it
      // is focusing, nor cost a server round trip.
      const now = `${window.location.pathname}${window.location.search}`;
      if (!isHistoryMove(now, committed.current.url)) return;
      poppedTo.current = now;
      refreshStarted.current = false;
      setChecking(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!checking) return;
    const now = backForwardCheck({
      started: refreshStarted.current,
      refreshing,
      url,
      poppedTo: poppedTo.current,
    });
    if (now === "done") setChecking(false);
    if (now === "done" || now === "busy") return;
    const start = () => {
      if (refreshStarted.current) return;
      refreshStarted.current = true;
      // The router restored this page from its cache without asking the
      // server. Keep it hidden until a refresh has run its gate again, on
      // the page now shown: a member who lost access never sees the cached
      // page.
      startRefresh(() => router.refresh());
    };
    if (now === "start") {
      start();
      return;
    }
    // Not moved yet. Should the router never arrive at that address (it
    // went somewhere else), check whatever it shows after a moment rather
    // than keep the window hidden.
    const late = window.setTimeout(start, POP_SETTLE_MS);
    return () => window.clearTimeout(late);
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
      } else if (isStaleReturn(hiddenAt, Date.now())) {
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
    if (gateRedirected(sent, pathname, heldNow.current)) router.refresh();
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
        refusedPageRefresh(
          !!body.querySelector("[data-captain-lock]"),
          refreshedLockFor.current,
          url,
        )
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

  // --- Access changed elsewhere (an approval, a promotion) ----------------------------
  // The layout is drawn once and kept while the member moves between pages,
  // so a captain approving or promoting them would not change the desktop
  // until a reload. Ask the server for the manifest's version on each new
  // page and when the tab comes back (events, not a timer), and refresh when
  // it is not the one drawn. A demotion is caught here too, before the
  // member meets a refused page.
  const drawnVersion = useRef(manifest.version);
  useEffect(() => {
    drawnVersion.current = manifest.version;
  });
  // One check at a time; a call while one is out runs once more after it,
  // so a change that lands on the server mid-check is not missed.
  const checkingAccess = useRef(false);
  const recheckAccess = useRef(false);
  const checkAccess = useCallback(() => {
    const run = () => {
      if (heldNow.current) return;
      if (checkingAccess.current) {
        recheckAccess.current = true;
        return;
      }
      checkingAccess.current = true;
      const settle = () => {
        checkingAccess.current = false;
        if (recheckAccess.current) {
          recheckAccess.current = false;
          run();
        }
      };
      fetch("/api/desktop/access", { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(`access check: ${res.status}`);
          return res.json() as Promise<{ version: string | null }>;
        })
        .then(
          ({ version: now }) => {
            if (accessChanged(now, drawnVersion.current)) router.refresh();
            settle();
          },
          // Offline or a failed check: the desktop keeps what it drew.
          settle,
        );
    };
    run();
  }, [router]);
  const checkedFor = useRef(pathname);
  useEffect(() => {
    if (checkedFor.current === pathname) return;
    checkedFor.current = pathname;
    checkAccess();
  }, [checkAccess, pathname]);
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === "visible") checkAccess();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [checkAccess]);

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
  // The program windows (not folders) as the cats see them: where each is.
  // Remade only when the window stack changes (a drag writes it once, at
  // the drop), and the cats' layer ignores a copy that is the same.
  const catWindows = useMemo(
    () =>
      wm.windows
        .filter((w) => !!w.lastUrl)
        .map((w) => ({
          id: w.id,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          minimized: !!w.minimized,
          maximized: !!w.maximized,
        })),
    [wm.windows],
  );

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
              pending: !!instance && pendingKey === instance,
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
                  // The page takes the window's width (no column of its
                  // own: a reading page keeps its own measure). Maximised on
                  // a desktop, it keeps clear of the Today handle and the
                  // Voice button over the window's right edge. A page that
                  // fills its window (data-fills-window) gets its height.
                  className={`w-full px-4 py-6 outline-none page-sm:px-6 has-[[data-fills-window]]:flex has-[[data-fills-window]]:h-full has-[[data-fills-window]]:flex-col ${w.maximized ? "md:pr-[60px]!" : ""}`}
                >
                  {children}
                </div>
              </>
            );
          } else if (!w.lastUrl) {
            body = folderBody(w.id);
          } else {
            const copy = w.minimized ? undefined : copyView.get(w.id);
            body = (
              <div inert aria-hidden className="h-full">
                {copy ? (
                  <LastSeenView key={copy.takenAt} copy={copy} />
                ) : (
                  <WindowPlaceholder
                    icon={iconOf(w, "size-12")}
                    label={title}
                    loading={pendingKey === w.id}
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
                w.id === top?.id && !w.maximized && !effectsOff ? (
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
              // The frame's buttons ask the leave guard themselves.
              onClose={() =>
                void send({ type: "close", id: w.id, asked: true })
              }
              onMinimize={() =>
                void send({ type: "minimize", id: w.id, asked: true })
              }
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
    held ||
    (phoneNow && searchOpen) ||
    !!page ||
    (!!top && !top.minimized && !top.lastUrl);
  // Nobody can see the CRT surface or the wordmark: a blocking form over
  // everything, a maximised window over the desktop, or on a phone a program
  // or sheet over the home screen. Their loops hold still (data-os-paused),
  // so a covered desktop costs what a hidden tab does.
  // On the desktop they also hold still while a program's window has focus:
  // the member is working in it, and the loops (the glitch steps some seven
  // times a second, the beam eight) otherwise ask for frames the whole time.
  // They play again on the bare desktop, or with a folder in front.
  const decorCovered =
    held ||
    (phoneNow
      ? phoneCovered
      : !!top && !top.minimized && (!!top.maximized || !!top.lastUrl));
  // Prince sleeps on the clock, just above the bar, at the screen's right.
  // Wherever a window, the Today panel or a phone program reaches down to
  // him there, he lets taps through to it rather than take them.
  const princeCovered = phoneNow
    ? phoneCovered || todayOpen || phoneVoiceOpen
    : (todayStored && !!today) ||
      wm.windows.some(
        (w) =>
          !w.minimized &&
          (w.maximized ||
            (w.x + w.w > viewport.width - 56 &&
              w.y + w.h > viewport.height - 32)),
      );
  const princeClass = princeCovered ? "pointer-events-none" : "";
  // Who sits on a clock: Prince asleep, or, for the one member who sees him
  // come home, the two of them (it waits, or holds still, while covered).
  const clockCat = (phone: boolean) =>
    princeKeeper ? (
      <ClockReunion
        covered={princeCovered || effectsOff}
        delayMs={reunionDelayMs}
      />
    ) : (
      <ClockPrince className={phone ? `right-2 ${princeClass}` : princeClass} />
    );
  // Held, on a page other than the form or its completion page: the two
  // pages that gate on camp access alone (the inbox and an announcement, from
  // a push or email link) render bare, as they did before the desktop, with
  // the inbox's own link to the form. Every other member page is sent to the
  // form by its server gate. The blocking layer holds only the form.
  if (mode === "held" && page?.programId !== "questionnaire") {
    return (
      <div
        data-os-skin
        {...displayAttributes(display.prefs)}
        className={HELD_BARE}
      >
        {children}
      </div>
    );
  }

  return (
    <DesktopSignalsContext.Provider value={signals}>
      <div
        id="os-desktop"
        data-os-skin
        {...displayAttributes(display.prefs)}
        inert={held || undefined}
        // A page on its way: a busy cursor everywhere on the desktop.
        aria-busy={navigating || undefined}
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
        {/* Calm keeps it still, without the beam; High contrast and Effects
            off leave it out of the page. */}
        {effects !== "none" && (
          <div data-os-paused={decorCovered || undefined} className="contents">
            <Surface beam={effects === "full"} />
          </div>
        )}
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
          {/* The wallpaper: the wordmark, its sub line and the year, centred. */}
          <div
            aria-hidden
            data-os-paused={decorCovered || undefined}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 max-md:hidden"
          >
            <OsWordmark text="404 OS" size="clamp(3rem, 7vw, 5.5rem)" />
            <p
              data-label={OS_SUBLINE}
              className="font-mono text-[11px] uppercase tracking-[0.3em] text-os-fg after:content-[attr(data-label)]"
            />
            {tagline && (
              <p
                data-label={tagline}
                className={`${effects === "full" ? "os-chromatic " : ""}font-mono text-[11px] uppercase tracking-[0.3em] text-os-fg after:content-[attr(data-label)]`}
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
            openOnClick={display.prefs.oneClickOpen}
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
          {/* Two more cats, who come under a program's window left open a
              while: over the icons, under the windows. The desktop's only;
              a phone has no windows to hide them. */}
          {!held && !phoneNow && (
            <WindowCats
              windows={catWindows}
              delayMs={catsDelayMs}
              still={effectsOff}
            />
          )}
          {windowLayer}
          {/* Today: shut until its handle is pulled; it slides in over the
              windows, on every screen (the prototype's pop-out). */}
          {!held && today?.warm}
          {!held && today && (
            <TodayGadget
              open={todayStored && !phoneNow}
              onOpenChange={setTodayStored}
              count={today.count}
              clearTitleBar={!!top?.maximized}
              className="absolute bottom-2 right-0 top-3 z-30 max-md:hidden"
              below={
                voiceOn && !phoneNow ? (
                  <DesktopVoice voice={voice} />
                ) : undefined
              }
            >
              {today.body}
            </TodayGadget>
          )}
          {/* Welcome to 404 OS: a full desktop only, never over a form. */}
          {display.welcomeOpen && mode === "full" && !held && (
            <WelcomeWizard
              prefs={display.prefs}
              effects={effects}
              onChange={display.change}
              onOpenToday={
                today && !phoneNow ? () => setTodayStored(true) : undefined
              }
              telegramOffer={telegramOffer}
              onClose={display.closeWelcome}
            />
          )}
          {/* The pay guide: a card from the tray, a banner above a phone's
              bar. A full desktop only, never over a form. */}
          {mode === "full" && !held && (
            <PayGuideOverlay covered={phoneCovered} />
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
              todayOpen={todayOpen && !page}
              todayCount={today?.count}
              searchOpen={searchOpen}
              onHome={() => {
                setTodayOpen(false);
                setSearchOpen(false);
                closePhoneVoice();
                goHome();
              }}
              onToday={() => {
                setSearchOpen(false);
                closePhoneVoice();
                toggleToday();
              }}
              onSearch={() => {
                setTodayOpen(false);
                closePhoneVoice();
                if (searchOpen) {
                  setSearchOpen(false);
                  return;
                }
                // Drawn now, inside the tap, and its field focused here too:
                // iOS opens the keyboard only for a focus the tap itself made.
                flushSync(() => setSearchOpen(true));
                document
                  .querySelector<HTMLInputElement>("[data-os-search] input")
                  ?.focus({ preventScroll: true });
              }}
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
              voice={
                voiceOn ? (
                  <PhoneVoiceCell
                    recording={voice.phase === "recording"}
                    open={phoneVoiceOpen}
                    offline={!voice.online}
                    onPress={() => {
                      if (voice.phase === "recording") {
                        voice.stop();
                        return;
                      }
                      if (phoneVoiceOpen) {
                        closePhoneVoice();
                        return;
                      }
                      setTodayOpen(false);
                      setSearchOpen(false);
                      setPhoneVoiceOpen(true);
                      if (voice.phase === "idle" && voice.online) {
                        void voice.start();
                      }
                    }}
                  />
                ) : undefined
              }
              clock={<PhoneClock burn={burn} decoration={clockCat(true)} />}
            />
            {voiceOn && phoneNow && phoneVoiceOpen && (
              <PhoneVoiceSheet voice={voice} onClose={closePhoneVoice} />
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
                clockDecoration={clockCat(false)}
                onOpenHref={openHref}
                onTidyWindows={() => dispatch({ type: "tidy", viewport })}
                onLineUpIcons={() => changeLayout(lineUpIcons(layout))}
                onShowDesktop={showDesktop}
                onOpenWelcome={display.openWelcome}
                onOpenSearch={() => setSearchOpen(true)}
              />
            </div>
            <ProgramSearch
              manifest={manifest}
              userId={userId}
              liveKey={liveKey}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              onOpenProgram={openProgram}
              onOpenEntry={openSearchEntry}
              phone={phoneNow}
            />
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
          paws={paws && !effectsOff}
          onKonami={() => openHref(INKBLOT_HREF)}
          onMeow={togglePaws}
        />
      )}
      {boot && !held && effects === "full" && (
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
