"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { mediaQueryList, PHONE_QUERY } from "./use-phone";
import { useLeaveGuard, WindowKeyProvider } from "./use-window-dirty";
import {
  clampPosition,
  resizeRect,
  type Edge,
  type OsWindow,
  type Rect,
  type Viewport,
} from "./window-manager";

type Props<K extends string> = {
  win: OsWindow<K>;
  title: string;
  /**
   * The old file name's extension after the title, quiet (decision 9 B:
   * "Roster .db"). Hidden from assistive tech and on a phone; the window's
   * name is the title alone.
   */
  suffix?: string;
  /**
   * Something drawn over the frame's top edge, outside the body (a cat that
   * peeks over the focused window now and then). Decorative: the caller
   * keeps it `aria-hidden` and free of pointer events.
   */
  decoration?: ReactNode;
  /**
   * Draw the title as an h2. Off by default: in the console the page inside
   * the window owns the headings. Join's windows sit under its page h1 and
   * start at h3, so Join turns it on.
   */
  titleHeading?: boolean;
  isTop: boolean;
  /** Minimised, or under the top window on a phone: kept mounted, not shown. */
  hidden: boolean;
  /** Phone layout: full screen, no dragging or resizing under a thumb. */
  phone: boolean;
  /**
   * Chosen by CSS, not by `phone` (the console): full screen with a big
   * Back/Close below `md`, a floating window from `md` up, so the server's
   * first paint is already right on a phone. Dragging and resizing check the
   * screen when they start. The frame's bottom edge on a phone is the
   * `--os-phone-bar` variable (the bottom bar's height), 0 when unset.
   */
  responsive?: boolean;
  /**
   * With `responsive`: not shown on a phone, where one window shows at a
   * time (the app decides which).
   */
  phoneHidden?: boolean;
  /**
   * Move focus into the window when it first mounts (the element marked
   * data-autofocus, else the frame). On unless turned off: the console moves
   * focus itself when a page arrives, and never for a restored window.
   */
  autoFocus?: boolean;
  /** Opening is on its way (the page not there yet): the title bar blinks. */
  pending?: boolean;
  /**
   * A frozen copy behind the live window (the console's background page
   * windows). A pointer still raises it, but screen readers and the Tab key
   * see one live window: the frame is no landmark and is hidden from
   * assistive tech, and its title-bar buttons leave the tab order. The
   * taskbar is the keyboard's way to it.
   */
  background?: boolean;
  /**
   * The window wants to come forward: a press in it, or focus moving into
   * it. A press on a title-bar button (close, minimise) is not a request.
   */
  onFocus: (via: "pointer" | "focus") => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (from: Rect, edge: Edge, dx: number, dy: number) => void;
  children: ReactNode;
};

// Eight invisible grips around the frame: four edges, four corners.
const GRIPS: { edge: Edge; className: string }[] = [
  { edge: "n", className: "inset-x-2 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", className: "inset-x-2 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "e", className: "inset-y-2 -right-1 w-2 cursor-ew-resize" },
  { edge: "w", className: "inset-y-2 -left-1 w-2 cursor-ew-resize" },
  { edge: "nw", className: "-left-1 -top-1 size-3 cursor-nwse-resize" },
  { edge: "ne", className: "-right-1 -top-1 size-3 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 size-3 cursor-nesw-resize" },
  { edge: "se", className: "-bottom-1 -right-1 size-4 cursor-nwse-resize" },
];

/**
 * Follow one pointer until it lets go: `onFrame` at most once an animation
 * frame with the distance so far (a fast drag fires many moves between two
 * paints, and only the last counts), and `onEnd` once, with the last
 * distance, when it lets go.
 */
function track(
  e: PointerEvent<HTMLElement>,
  onFrame: (dx: number, dy: number) => void,
  onEnd: (dx: number, dy: number) => void,
) {
  const el = e.currentTarget;
  const x0 = e.clientX;
  const y0 = e.clientY;
  el.setPointerCapture(e.pointerId);
  let frame = 0;
  let last: [number, number] = [0, 0];
  let pending = false;
  const flush = () => {
    frame = 0;
    if (!pending) return;
    pending = false;
    onFrame(last[0], last[1]);
  };
  const move = (ev: globalThis.PointerEvent) => {
    last = [ev.clientX - x0, ev.clientY - y0];
    pending = true;
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const up = () => {
    cancelAnimationFrame(frame);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    onEnd(last[0], last[1]);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

/** The desktop a frame sits on: its positioned parent's box. */
function desktopOf(el: HTMLElement): Viewport {
  const parent = (el.offsetParent as HTMLElement | null) ?? document.body;
  return { width: parent.clientWidth, height: parent.clientHeight };
}

/**
 * One window: a labelled region (not a dialog, which it is not: the rest of
 * the desktop stays usable), with a title bar to drag, eight grips to resize
 * and a body that scrolls on its own. At rest it is positioned with left and
 * top, never a transform, so drag-and-drop and popovers inside it measure
 * true; only while its title bar is dragged does it wear a transform.
 */
export function OsWindowFrame<K extends string>({
  win,
  title,
  suffix,
  decoration,
  titleHeading = false,
  isTop,
  hidden,
  phone,
  responsive = false,
  phoneHidden = false,
  autoFocus = true,
  pending = false,
  background = false,
  onFocus,
  onClose,
  onMinimize,
  onToggleMaximize,
  onMove,
  onResize,
  children,
}: Props<K>) {
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = `${useId()}-title`;
  const Title = titleHeading ? "h2" : "span";
  const fills = phone || win.maximized;
  const mayLeave = useLeaveGuard();

  // A page with unsaved input is asked about first.
  const close = () => {
    if (mayLeave(win.id)) onClose();
  };
  const minimize = () => {
    if (mayLeave(win.id)) onMinimize();
  };

  // Focus moves into a window when it opens: to the element that asks for it
  // (the terminal's prompt), else the window itself.
  const focusOnMount = useRef(autoFocus);
  useEffect(() => {
    const el = ref.current;
    if (!el || !focusOnMount.current) return;
    const wanted = el.querySelector<HTMLElement>("[data-autofocus]");
    (wanted ?? el).focus({ preventScroll: true });
  }, []);

  // The body's own height as `--page-h`, for a page part that must fit the
  // window's visible height (a sticky rail with its own scroll). `--win-h`
  // will not do: it is the frame's restored height, kept while the window is
  // maximised or on a phone, where the frame is sized by CSS instead.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      body.style.setProperty("--page-h", `${body.clientHeight}px`);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [win.id]);

  // Esc closes the window, but only an Esc nobody else used, pressed on
  // something really inside it. React sends a portal's events up through
  // the window too, so without the second check dismissing a select menu
  // or a popover drawn outside the window would close the program with it.
  // Not from a field being typed in either: Esc there clears a search or
  // leaves an edit, and must not take the program (and the typing) with it.
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (isEditable(e.target)) return;
    e.stopPropagation();
    close();
  }

  // A drag or resize never goes through React while the pointer is down:
  // each frame writes the frame's own style (a transform for a move, its
  // place and size for a resize), and the window manager hears once, when it
  // lets go. Before, every frame re-rendered the desktop and saved the
  // windows. The preview is clamped the way the window manager clamps, so the
  // window does not jump when it lands. `gesture` holds what to clear once the
  // new place has been drawn by React.
  const gesture = useRef<"move" | "resize" | null>(null);
  function clearGesture(el: HTMLElement) {
    el.style.removeProperty("transform");
    el.removeAttribute("data-gesture");
    document.documentElement.removeAttribute("data-os-gesture");
    gesture.current = null;
  }
  function beginGesture(el: HTMLElement, kind: "move" | "resize") {
    gesture.current = kind;
    el.setAttribute("data-gesture", kind);
    // The desktop's decorative loops hold still while a window moves.
    document.documentElement.setAttribute("data-os-gesture", "");
  }
  /**
   * After telling the window manager: React draws the new place and the
   * layout effect clears the preview. Should the new place equal the old
   * (nothing re-renders), clear it two frames on regardless.
   */
  function settle(el: HTMLElement) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (gesture.current) clearGesture(el);
      }),
    );
  }
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && gesture.current === "move") clearGesture(el);
  }, [win.x, win.y]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && gesture.current === "resize") clearGesture(el);
  }, [win.x, win.y, win.w, win.h]);

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (fills || e.button !== 0 || onPhoneNow()) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const el = ref.current;
    if (!el) return;
    const { x, y, w } = win;
    const vp = desktopOf(el);
    // An unmeasured desktop (no layout yet) is not a reason to pin the
    // window: the window manager clamps it when it lands anyway.
    const at = (dx: number, dy: number) =>
      vp.width > 0 && vp.height > 0
        ? clampPosition(x + dx, y + dy, w, vp)
        : { x: x + dx, y: y + dy };
    beginGesture(el, "move");
    track(
      e,
      (dx, dy) => {
        const p = at(dx, dy);
        el.style.transform = `translate(${p.x - x}px, ${p.y - y}px)`;
      },
      (dx, dy) => {
        const p = at(dx, dy);
        if (p.x === x && p.y === y) clearGesture(el);
        else {
          onMove(p.x, p.y);
          settle(el);
        }
      },
    );
  }

  function startResize(edge: Edge, e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || onPhoneNow()) return;
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    const from = { x: win.x, y: win.y, w: win.w, h: win.h };
    const vp = desktopOf(el);
    beginGesture(el, "resize");
    const draw = (r: Rect) => {
      if (responsive) {
        el.style.setProperty("--win-x", `${r.x}px`);
        el.style.setProperty("--win-y", `${r.y}px`);
        el.style.setProperty("--win-w", `${r.w}px`);
        el.style.setProperty("--win-h", `${r.h}px`);
      } else {
        el.style.left = `${r.x}px`;
        el.style.top = `${r.y}px`;
        el.style.width = `${r.w}px`;
        el.style.height = `${r.h}px`;
      }
    };
    const sized = (dx: number, dy: number) =>
      vp.width > 0 && vp.height > 0
        ? resizeRect(from, edge, dx, dy, vp)
        : resizeRect(from, edge, dx, dy, {
            width: Number.POSITIVE_INFINITY,
            height: Number.POSITIVE_INFINITY,
          });
    track(
      e,
      (dx, dy) => draw(sized(dx, dy)),
      (dx, dy) => {
        const r = sized(dx, dy);
        if (
          r.x === from.x &&
          r.y === from.y &&
          r.w === from.w &&
          r.h === from.h
        ) {
          clearGesture(el);
          return;
        }
        // The last size stays drawn until React writes the same one.
        draw(r);
        onResize(from, edge, dx, dy);
        settle(el);
      },
    );
  }

  // A responsive frame is a floating window only from md up, where CSS
  // reads its place from variables; inline left/top would win over the
  // phone's full-screen classes.
  function onPhoneNow() {
    return responsive && mediaQueryList(PHONE_QUERY).matches;
  }

  const placement: CSSProperties = responsive
    ? ({
        zIndex: 20 + win.z,
        "--win-x": `${win.x}px`,
        "--win-y": `${win.y}px`,
        "--win-w": `${win.w}px`,
        "--win-h": `${win.h}px`,
      } as CSSProperties)
    : fills
      ? { zIndex: 20 + win.z }
      : {
          zIndex: 20 + win.z,
          left: win.x,
          top: win.y,
          width: win.w,
          height: win.h,
        };

  const button =
    "grid size-7 place-items-center font-mono leading-none hover:bg-os-bg/30";

  const frameClass = responsive
    ? `max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:bottom-[var(--os-phone-bar,0px)] ${
        phoneHidden ? "max-md:hidden" : ""
      } md:border ${
        win.maximized
          ? "md:absolute md:inset-0"
          : "md:absolute md:left-[var(--win-x)] md:top-[var(--win-y)] md:h-[var(--win-h)] md:w-[var(--win-w)]"
      } ${
        isTop
          ? "border-os-primary md:shadow-[0_0_40px_-8px_var(--os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line md:shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      }`
    : `border ${
        phone
          ? "fixed inset-x-0 top-0 bottom-10"
          : win.maximized
            ? "absolute inset-0"
            : "absolute"
      } ${
        isTop
          ? "border-os-primary shadow-[0_0_40px_-8px_var(--os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      }`;

  return (
    <section
      ref={ref}
      aria-roledescription={background ? undefined : "window"}
      aria-labelledby={background ? undefined : titleId}
      aria-hidden={background || undefined}
      tabIndex={-1}
      data-window={win.id}
      data-window-title={title}
      data-top={isTop || undefined}
      data-maximized={win.maximized || undefined}
      aria-busy={pending || undefined}
      hidden={hidden}
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-titlebar] button")) {
          return;
        }
        onFocus("pointer");
      }}
      onFocusCapture={() => onFocus("focus")}
      onKeyDown={onKeyDown}
      style={placement}
      className={`os-window-in pointer-events-auto flex flex-col outline-none ${frameClass} bg-os-panel`}
    >
      {decoration}
      <div
        data-titlebar
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if (phone || onPhoneNow()) return;
          if ((e.target as HTMLElement).closest("button")) return;
          onToggleMaximize();
        }}
        className={`flex shrink-0 select-none items-center justify-between gap-2 border-b pr-1 ${
          responsive ? "h-12 md:h-9 md:pl-3" : "h-9 pl-3"
        } ${fills ? "" : responsive ? "md:cursor-grab md:active:cursor-grabbing" : "cursor-grab active:cursor-grabbing"} ${
          isTop
            ? "border-os-primary bg-os-primary text-os-primary-fg"
            : // The app may keep colour on it (the console: a soft tint of
              // the primary); unset, the chrome with the quiet colour lifted.
              "border-os-line bg-os-bar-idle text-os-bar-idle-fg"
        }`}
      >
        {responsive && (
          // A phone's way out: big, on the left, the first thing a thumb
          // finds (visual-language doc, section 9).
          <button
            type="button"
            onClick={close}
            tabIndex={background ? -1 : undefined}
            aria-label={`Back, close ${title}`}
            className="flex h-12 min-w-11 shrink-0 items-center gap-1 pl-2 pr-3 font-pixel text-xs uppercase hover:bg-os-bg/30 md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden
              className="size-5 shrink-0"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Back
          </button>
        )}
        <span
          className={`flex min-w-0 items-baseline gap-2 ${
            responsive ? "max-md:flex-1 max-md:justify-center" : ""
          }`}
        >
          <Title
            id={titleId}
            className={`truncate font-pixel text-xs uppercase tracking-[0.2em] ${
              responsive ? "max-md:text-center max-md:text-sm" : ""
            } ${pending ? "os-pending" : ""}`}
          >
            {title}
          </Title>
          {suffix && (
            <span
              aria-hidden
              data-suffix
              className={`shrink-0 font-mono text-[10px] normal-case tracking-normal opacity-55 ${
                responsive ? "max-md:hidden" : ""
              }`}
            >
              {suffix}
            </span>
          )}
        </span>
        {responsive && (
          // Balances the Back button, so the title sits in the middle.
          <span aria-hidden className="w-[4.75rem] shrink-0 md:hidden" />
        )}
        <div
          className={`flex shrink-0 items-center ${responsive ? "max-md:hidden" : ""}`}
        >
          <button
            type="button"
            onClick={minimize}
            tabIndex={background ? -1 : undefined}
            aria-label={`Minimise ${title}`}
            title="Minimise"
            className={button}
          >
            <span aria-hidden className="mt-2 block h-0.5 w-3 bg-current" />
          </button>
          {!phone && (
            <button
              type="button"
              onClick={onToggleMaximize}
              tabIndex={background ? -1 : undefined}
              aria-label={`${win.maximized ? "Restore" : "Full screen"} ${title}`}
              aria-pressed={!!win.maximized}
              title={win.maximized ? "Restore" : "Full screen"}
              className={button}
            >
              {win.maximized ? (
                <span aria-hidden className="relative block size-3">
                  <span className="absolute right-0 top-0 size-2 border border-current" />
                  <span className="absolute bottom-0 left-0 size-2 border border-current bg-inherit" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="block size-3 border border-t-2 border-current"
                />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            tabIndex={background ? -1 : undefined}
            aria-label={`Close ${title}`}
            title="Close"
            className={`${button} text-lg`}
          >
            ×
          </button>
        </div>
      </div>
      {/* Its own scroll box and size container, keyed by the window, so one
          window's scroll position never carries into another. Its text can be
          selected, though the desktop's chrome around it cannot. The page
          container: the kit's page-sm/md/lg/xl variants lay the page out by
          this box's width, not the screen's (@camp404/ui styles). */}
      <div
        key={win.id}
        ref={bodyRef}
        data-window-body
        data-page-container
        className="@container/page min-h-0 flex-1 select-text overflow-auto overscroll-contain"
      >
        <WindowKeyProvider windowKey={win.id}>{children}</WindowKeyProvider>
      </div>
      {!fills && (
        <>
          <div
            aria-hidden
            className={`pointer-events-none absolute bottom-0 right-0 size-4 ${responsive ? "max-md:hidden" : ""} bg-[linear-gradient(135deg,transparent_50%,var(--os-line)_50%,var(--os-line)_60%,transparent_60%,transparent_70%,var(--os-line)_70%,var(--os-line)_80%,transparent_80%)]`}
          />
          {GRIPS.map((g) => (
            <div
              key={g.edge}
              aria-hidden
              data-grip={g.edge}
              onPointerDown={(e) => startResize(g.edge, e)}
              className={`absolute z-10 ${g.className} ${responsive ? "max-md:hidden" : ""}`}
            />
          ))}
        </>
      )}
    </section>
  );
}

/** Input types that take no typing: Esc on them may close the window. */
const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Something the member types into, where Esc belongs to the field. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TYPED.has(target.type);
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.closest("[contenteditable]:not([contenteditable='false'])")) {
    return true;
  }
  // A Select's trigger is a button with role="combobox": nothing is typed
  // there, so Esc on it is the window's.
  const role = target.getAttribute("role");
  if (role === "combobox") return !(target instanceof HTMLButtonElement);
  return role === "searchbox" || role === "textbox";
}
