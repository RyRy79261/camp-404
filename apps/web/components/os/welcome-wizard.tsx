"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type {
  DesktopPreferences,
  DesktopPreferencesPatch,
} from "@camp404/types/desktop-preferences";
import type { OsThemeEffects } from "@/lib/os-themes";
import { DisplayControls, OneClickSwitch } from "./display-controls";
import { LineIcon } from "./line-icons";

// "Welcome to 404 OS" (issue #289; docs/specs/2026-09-26-404-os-welcome-and-
// themes.md, Part 1): a panel from the right edge, framed like the Today
// pop-out, the first time a member reaches a full desktop. A few short steps,
// each one screen, with Back, Next and "Skip for now". Plain words only.
//
// It is not a gate: nothing waits for it and the server never sends anyone
// to it. Closing it in any way (Done, Skip for now, ×, Esc) counts as seen
// (the desktop saves that); Start > Welcome opens it again.
//
// Keyboard: focus moves to the step's heading when it opens and on every
// step, so a screen reader reads each heading; Esc closes; focus then goes
// back to where it was on the desktop. Reduced motion (or Effects off): no
// slide in, and the demo window moves only when the member moves it.

export interface WelcomeWizardProps {
  prefs: DesktopPreferences;
  effects: OsThemeEffects;
  onChange: (patch: DesktopPreferencesPatch) => void;
  /** Open the Today panel (the step about it). */
  onOpenToday?: () => void;
  onClose: () => void;
}

type Step = {
  key: string;
  title: string;
  body: ReactNode;
};

/** The small window on the "Windows" step, which the member can drag. */
function DemoWindow() {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x: 12, y: 12 });
  const W = 150;
  const H = 72;

  function clamp(x: number, y: number) {
    const el = box.current;
    const maxX = el ? el.clientWidth - W - 2 : 100;
    const maxY = el ? el.clientHeight - H - 2 : 60;
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, from: at };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) =>
      setAt(
        clamp(
          start.from.x + ev.clientX - start.x,
          start.from.y + ev.clientY - start.y,
        ),
      );
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 24 : 8;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const by = d[e.key];
    if (!by) return;
    e.preventDefault();
    setAt((p) => clamp(p.x + by[0], p.y + by[1]));
  }

  return (
    <div
      ref={box}
      data-welcome-demo
      className="relative h-32 border border-dashed border-os-line bg-os-bg"
    >
      <div
        className="absolute flex flex-col border border-os-primary bg-os-panel"
        style={{ left: at.x, top: at.y, width: W, height: H }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label="Practice window's title bar. Drag it, or press the arrow keys, to move the window."
          onPointerDown={down}
          onKeyDown={key}
          className="flex h-6 shrink-0 cursor-grab touch-none select-none items-center justify-between bg-os-primary px-1.5 font-pixel text-[10px] uppercase text-os-primary-fg active:cursor-grabbing"
        >
          <span aria-hidden>Drag me</span>
        </div>
        <p className="p-1.5 text-[11px] leading-snug text-os-fg">
          Hold the title bar and move.
        </p>
      </div>
    </div>
  );
}

export function WelcomeWizard({
  prefs,
  effects,
  onChange,
  onOpenToday,
  onClose,
}: WelcomeWizardProps) {
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  // Where focus was when the wizard opened, to hand it back.
  const returnTo = useRef<HTMLElement | null>(null);

  const steps: Step[] = [
    {
      key: "welcome",
      title: "Welcome",
      body: (
        <>
          <p>
            This is your camp desktop. Each of your camp tools opens in its own
            window, like programs on a computer.
          </p>
          <p>A few short tips follow. You can skip them at any time.</p>
        </>
      ),
    },
    {
      key: "opening",
      title: "Opening things",
      body: (
        <>
          {/* By CSS, as the phone's layout is (phone-chrome.tsx): the
              server's first paint is right at either width. A phone always
              opens with one tap, so it gets no switch and no talk of
              double-clicks, keys or boxes. */}
          <div
            data-welcome-desktop
            className="flex flex-col gap-3 max-md:hidden"
          >
            <p>
              Double-click an icon to open it, or select it and press Enter.
            </p>
            <p>If double-clicking is hard, turn this on:</p>
            <OneClickSwitch prefs={prefs} onChange={onChange} />
          </div>
          <p data-welcome-phone className="md:hidden">
            Tap a program once to open it.
          </p>
        </>
      ),
    },
    {
      key: "windows",
      title: "Windows",
      body: (
        <>
          <p>
            Drag a window by its title bar to move it. The bar along the bottom
            shows what is open: click a name there to bring it to the front.
            Close a window with ×.
          </p>
          <DemoWindow />
        </>
      ),
    },
    {
      key: "desktop",
      title: "Your desktop",
      body: (
        <>
          <p>
            Right-click an empty spot to make a folder, or right-click a program
            to make a shortcut. Drag icons wherever you like; they stay put.
          </p>
          <p>
            Your teams sit on the right. The Teams folder holds every team in
            the camp.
          </p>
        </>
      ),
    },
    {
      key: "today",
      title: "Today",
      body: (
        <>
          <p className="flex items-start gap-2">
            <span>
              The tab on the right edge, marked Today, opens your list: what
              needs you, and what is coming up.
            </span>
            <LineIcon
              name="chevron-right"
              className="mt-0.5 size-5 shrink-0 text-os-primary"
            />
          </p>
          {onOpenToday && (
            <button
              type="button"
              onClick={onOpenToday}
              className="w-fit border border-os-line bg-os-panel px-3 py-1.5 font-pixel text-[11px] uppercase text-os-fg hover:border-os-primary"
            >
              Open Today
            </button>
          )}
        </>
      ),
    },
    {
      key: "looks",
      title: "How it looks",
      body: (
        <>
          <p>
            Pick what is easiest on your eyes. It changes at once, and you can
            change it later in My account, under Display.
          </p>
          <DisplayControls prefs={prefs} onChange={onChange} />
        </>
      ),
    },
    {
      key: "done",
      title: "Done",
      body: (
        <p>
          That&rsquo;s it. You can open this again from the Start menu
          (Welcome), or from My account, under Display.
        </p>
      ),
    },
  ];
  const last = steps.length - 1;
  const step = steps[index]!;
  const besideIcons = step.key === "desktop";

  // Focus into the panel on opening, and to each new step's heading.
  useEffect(() => {
    if (returnTo.current === null) {
      const active = document.activeElement;
      returnTo.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
    }
    heading.current?.focus({ preventScroll: true });
  }, [index]);

  function close() {
    onClose();
    const back = returnTo.current;
    requestAnimationFrame(() => {
      const target =
        back && back.isConnected
          ? back
          : document.querySelector<HTMLElement>(
              "#os-desktop [data-os-icons] [tabindex='0'], #os-desktop [data-os-start-button]",
            );
      target?.focus({ preventScroll: true });
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.stopPropagation();
    close();
  }

  const button =
    "border px-3 py-1.5 font-pixel text-[11px] uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-os-welcome
      onKeyDown={onKeyDown}
      data-dock={besideIcons ? "beside-icons" : "right"}
      className={`pointer-events-auto absolute ${
        // "Your desktop" talks about the team folders on the right, so on a
        // wide screen the panel moves beside the icons for that step,
        // covering neither the icons nor the team folders. It jumps; it
        // never slides.
        besideIcons ? "left-[19.5rem]" : "right-11"
      } top-3 bottom-2 z-40 flex w-96 max-w-[calc(100%-3.5rem)] select-text flex-col border border-os-primary bg-os-bg text-os-fg shadow-[6px_6px_0_0_rgb(0_0_0/0.45)] max-md:inset-x-0 max-md:top-0 max-md:bottom-0 max-md:right-0 max-md:w-auto max-md:max-w-none max-md:z-[95] ${
        effects === "none" ? "" : "os-slide-in"
      }`}
    >
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-os-line bg-os-chrome pl-2.5 pr-1">
        <p
          id={titleId}
          className="flex min-w-0 items-center gap-1.5 truncate font-pixel text-[10px] uppercase tracking-widest text-os-fg"
        >
          <LineIcon name="info" className="size-3.5 shrink-0" />
          Welcome to 404 OS
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="Close the welcome"
          className="grid size-7 place-items-center text-os-fg outline-none hover:text-os-primary focus-visible:outline-2 focus-visible:outline-os-fg"
        >
          <LineIcon name="x" className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-os-muted">
          Step {index + 1} of {steps.length}
        </p>
        <h2
          ref={heading}
          tabIndex={-1}
          data-welcome-step={step.key}
          className="mb-3 text-lg text-os-fg outline-none"
        >
          {step.title}
        </h2>
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-os-fg">
          {step.body}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-os-line bg-os-panel p-2">
        {index < last && (
          <button
            type="button"
            onClick={close}
            className={`${button} mr-auto border-transparent text-os-muted hover:text-os-fg focus-visible:outline-os-fg`}
          >
            Skip for now
          </button>
        )}
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className={`${button} ${index === last ? "mr-auto" : ""} border-os-line bg-os-panel text-os-fg hover:border-os-primary focus-visible:outline-os-fg`}
          >
            Back
          </button>
        )}
        {index < last ? (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className={`${button} border-os-fg bg-os-fg text-os-bg hover:border-os-primary hover:bg-os-primary focus-visible:outline-os-primary`}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={close}
            className={`${button} border-os-fg bg-os-fg text-os-bg hover:border-os-primary hover:bg-os-primary focus-visible:outline-os-primary`}
          >
            Done
          </button>
        )}
      </div>
    </aside>
  );
}
