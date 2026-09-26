"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

// The taskbar's right-hand end (visual-language doc 4.7): named slots in a
// fixed order, so every app and every mode draws them the same way round.
// What goes in a slot, and whether it is there at all (the restricted and
// held desktops get no pins and no system-health item), is the app's
// manifest's to say.

export type TraySlots = {
  /** The inbox bell and its popover. */
  inbox?: ReactNode;
  /** The pinned-announcements count. */
  pins?: ReactNode;
  /** The system-health warning, shown only when something is wrong. */
  health?: ReactNode;
  /** The Burn countdown. */
  countdown?: ReactNode;
  /** The clock, last. */
  clock?: ReactNode;
};

const ORDER: (keyof TraySlots)[] = [
  "inbox",
  "pins",
  "health",
  "countdown",
  "clock",
];

export function Tray({
  slots,
  label = "Tray",
}: {
  slots: TraySlots;
  label?: string;
}) {
  const present = ORDER.filter((k) => slots[k] != null && slots[k] !== false);
  if (present.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 select-none items-center gap-1 pl-1"
    >
      {present.map((k) => (
        <div key={k} data-tray={k} className="flex items-center">
          {slots[k]}
        </div>
      ))}
    </div>
  );
}

type TrayButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  /** Its name, read out; a count is added to it. */
  label: string;
  /** A count chip ("3 new"). None at zero. */
  count?: number;
  /** How the count is read: "unread", "pinned", "warnings". */
  countNoun?: string;
  children: ReactNode;
};

/** A 32px tray button with an optional count chip. */
export const TrayButton = forwardRef<HTMLButtonElement, TrayButtonProps>(
  function TrayButton(
    { label, count = 0, countNoun = "new", className = "", children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={count > 0 ? `${label}, ${count} ${countNoun}` : label}
        title={label}
        {...rest}
        className={`relative grid size-8 place-items-center border border-transparent text-os-fg outline-none hover:border-os-line focus-visible:border-os-primary aria-expanded:border-os-primary ${className}`}
      >
        {children}
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center bg-os-primary px-0.5 font-mono text-[10px] font-bold leading-none text-os-primary-fg"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    );
  },
);

/**
 * A small balloon over the tray: a plain sentence (the member's "Something in
 * the app is not working right now"). Esc or a press elsewhere shuts it and
 * focus goes back to its button. Band 95.
 */
export function TrayBalloon({
  open,
  onClose,
  anchor,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The button that opened it: a press on it is not a press away. */
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) {
        closeRef.current();
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
      anchor.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open, anchor]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="status"
      className="fixed bottom-12 right-2 z-[95] max-w-72 select-text border border-os-primary bg-os-panel px-3 py-2 text-sm text-os-fg shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
    >
      {children}
    </div>
  );
}

/**
 * The time, updated once a minute on the minute, not every second: the idle
 * desktop should cost nothing (design doc, section 8). A hidden tab stops the
 * timer; coming back shows the right time at once. Null until mounted, so the
 * server and the first paint agree.
 */
export function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      const d = new Date();
      setNow(d);
      timer = window.setTimeout(
        tick,
        60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50,
      );
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
