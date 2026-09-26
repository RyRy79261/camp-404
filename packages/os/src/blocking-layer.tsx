"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { focusFirst, trapTab } from "./focus";

// A blocking form on top of everything (owner, 2026-09-25: "Blocking
// questionnaires will sit on top of everything"). The desktop stays drawn
// behind, dimmed, and cannot be reached: no close, minimise or maximise, Esc
// does nothing, and focus stays inside. Sign out is the one way out besides
// answering.
//
// It is a picture, not a gate: the server's redirect is the gate. Nothing
// here decides who is held.
//
// Band 108 (visual-language doc 4.9): above the Start menu (100) and the
// right-click menu (105), below the Radix overlays (110), so the form's own
// Selects and dialogs open above it.

type Props = {
  /** The title bar's words: "Required form". */
  title: string;
  /** Quiet text at the title bar's right: "1 of 2". */
  position?: string;
  /**
   * The id of the form's own heading, which names the dialog. The title bar
   * names it when not given.
   */
  labelledBy?: string;
  /**
   * Without `labelledBy`: name the dialog by the first h1 inside it (given an
   * id if it has none), so it follows the page the layer holds (the form,
   * then its completion page). The title bar names it while there is none.
   */
  nameFromHeading?: boolean;
  /** The way out: the app's sign-out link, drawn under the form. */
  signOut?: ReactNode;
  /**
   * The id of the desktop behind (for example "os-desktop"), made inert while
   * the layer is up. Left alone if it was inert already, so the layer never
   * wakes what something else put to sleep. Omit it when the desktop sets
   * its own `inert`.
   */
  inertTarget?: string;
  children: ReactNode;
};

const InBlockingLayer = createContext(false);

/**
 * Whether this is drawn inside a blocking layer that has its own Sign out. A
 * page that draws one for the bare case (the runner's header, the completion
 * page) leaves it out there rather than show two.
 */
export function useInBlockingLayer(): boolean {
  return useContext(InBlockingLayer);
}

export function BlockingLayer({
  title,
  position,
  labelledBy,
  nameFromHeading = false,
  signOut,
  inertTarget,
  children,
}: Props) {
  const titleId = `${useId()}-title`;
  const frame = useRef<HTMLDivElement>(null);

  // The page's heading, read after every render (the page inside changes
  // with the address); state only when it moved, so this never loops.
  const [headingId, setHeadingId] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!nameFromHeading || labelledBy) return;
    const heading = frame.current?.querySelector<HTMLElement>("h1") ?? null;
    if (heading && !heading.id) heading.id = `${titleId}-heading`;
    const id = heading?.id ?? null;
    setHeadingId((old) => (old === id ? old : id));
  });

  // Focus starts in the form: a field marked data-autofocus, else the first.
  useEffect(() => {
    if (frame.current) focusFirst(frame.current);
  }, []);

  // The desktop behind goes to sleep while the layer is up.
  useEffect(() => {
    if (!inertTarget) return;
    const el = document.getElementById(inertTarget);
    if (!el || el.hasAttribute("inert")) return;
    if (frame.current && el.contains(frame.current)) return;
    el.setAttribute("inert", "");
    return () => el.removeAttribute("inert");
  }, [inertTarget]);

  // Esc does nothing here. Radix has already used an Esc meant for the form's
  // own Select or dialog (it listens first, on the document); this stops the
  // rest from reaching the desktop, which would close a window.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      return;
    }
    trapTab(e, frame.current);
  }

  return (
    <div
      data-os-blocking
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[108] grid bg-os-bg/85 backdrop-blur-[2px] md:place-items-center md:p-6"
    >
      <div
        ref={frame}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? headingId ?? titleId}
        tabIndex={-1}
        className="relative flex h-dvh w-full select-text flex-col border-os-primary bg-os-panel outline-none md:h-auto md:max-h-[calc(100dvh-3rem)] md:max-w-lg md:border md:shadow-[8px_8px_0_0_rgb(0_0_0/0.45)]"
      >
        <div className="flex h-9 shrink-0 select-none items-center justify-between gap-2 bg-os-primary px-3 text-os-primary-fg">
          <span
            id={titleId}
            className="truncate font-pixel text-xs uppercase tracking-[0.2em]"
          >
            {title}
          </span>
          {position && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider opacity-80">
              {position}
            </span>
          )}
        </div>
        <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <InBlockingLayer.Provider value={!!signOut}>
            {children}
          </InBlockingLayer.Provider>
        </div>
        {signOut && (
          <div className="flex shrink-0 justify-end border-t border-os-line px-4 py-2 text-sm">
            {signOut}
          </div>
        )}
      </div>
    </div>
  );
}
