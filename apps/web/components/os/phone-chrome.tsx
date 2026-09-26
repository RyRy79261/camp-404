"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Bug, ChevronLeft, House, Layers, LogOut, Sun } from "lucide-react";
import { iconName, type DesktopIconItem } from "@camp404/os";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { openReportProblem } from "@/components/feedback/report-problem";

// The phone's Classic desktop (below md; design doc, section 5; visual
// language doc, section 9). Drawn by CSS, not by a screen check: every piece
// here is `md:hidden`, and the desktop's pieces are `max-md:hidden`, so the
// server's first paint is already right at 390 px and nothing flips after
// hydration.
//
//  - the home screen: the same groups as the desktop (Me, Camp, Captains,
//    with the Terminal), rows of big icons, then a My teams row of team
//    folders. A fixed order: no dragging, no right-click menu, and the
//    member's own folders and shortcuts are not here (desktop only);
//  - the bottom bar, in place of the taskbar: Home, Open programs, the inbox
//    bell and Today;
//  - sheets over the home screen: the open-programs list and Today.

/** One group of the home screen: its name and its icons, in order. */
export interface PhoneGroup {
  key: string;
  label: string;
  items: PhoneIcon[];
}

export interface PhoneIcon extends DesktopIconItem {
  onOpen: () => void;
}

/** The home screen: `/` on a phone. */
export function PhoneHome({
  groups,
  notices,
  covered = false,
}: {
  groups: readonly PhoneGroup[];
  /** Lines above the icons: the pending applicant's note, system health. */
  notices?: ReactNode;
  /**
   * A program or sheet covers it whole: out of the Tab order and the
   * accessibility tree (`inert`), so both see one live window. Only ever
   * shown below md, so the flag changes nothing on a desktop.
   */
  covered?: boolean;
}) {
  return (
    <div
      data-os-phone-home
      inert={covered || undefined}
      className="absolute inset-0 select-none overflow-y-auto overscroll-contain md:hidden"
    >
      <div className="mx-auto flex max-w-md flex-col gap-5 px-3 pb-6 pt-4">
        {notices}
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <nav
              key={group.key}
              aria-label={group.label}
              className="flex flex-col gap-2"
            >
              <h2 className="px-1 font-pixel text-[10px] uppercase tracking-widest text-os-muted">
                {group.label}
              </h2>
              <ul className="grid grid-cols-3 gap-x-1 gap-y-2 min-[380px]:grid-cols-4">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <PhoneIconButton item={item} />
                  </li>
                ))}
              </ul>
            </nav>
          ),
        )}
        <PhoneFoot />
      </div>
    </div>
  );
}

/** A big icon: at least 48 px of picture, the whole cell a 64 x 80 target. */
function PhoneIconButton({ item }: { item: PhoneIcon }) {
  return (
    <button
      type="button"
      data-phone-icon={item.key}
      onClick={item.onOpen}
      aria-label={iconName(item)}
      className={`group relative flex min-h-20 w-full min-w-16 flex-col items-center gap-1.5 p-1 text-os-accent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-primary ${
        item.pending ? "os-pending" : ""
      }`}
    >
      <span aria-hidden className="relative">
        {item.icon(
          `size-12 ${item.open ? "text-os-primary drop-shadow-[0_0_8px_var(--os-primary)]" : ""}`,
        )}
        {item.badge ? (
          <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center bg-os-primary px-0.5 font-mono text-[10px] font-bold leading-none text-os-primary-fg">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
        {item.lead && (
          <span className="absolute -left-3 -top-1.5 border border-os-primary bg-os-bg px-0.5 font-pixel text-[10px] uppercase leading-tight text-os-fg">
            Lead
          </span>
        )}
      </span>
      {/* Drawn by CSS, as on the desktop, so an icon's name never collides
          with the same words in a page; the button's name is its label. */}
      <span
        aria-hidden
        data-label={item.label}
        className={`line-clamp-2 max-w-full px-1 py-0.5 text-center font-pixel text-[11px] uppercase leading-tight after:content-[attr(data-label)] ${
          item.open
            ? "bg-os-primary text-os-primary-fg"
            : "bg-os-chrome/80 text-os-fg"
        }`}
      />
    </button>
  );
}

/** The Start menu's foot, on a phone: Report a problem and Log off. */
function PhoneFoot() {
  const row =
    "flex min-h-11 items-center gap-2 border border-os-line bg-os-panel px-3 font-pixel text-[11px] uppercase tracking-wider text-os-fg";
  return (
    <div className="grid grid-cols-2 gap-2 pt-2">
      <button type="button" className={row} onClick={() => openReportProblem()}>
        <Bug aria-hidden className="size-4" />
        Report a problem
      </button>
      {/* Never a plain /auth/sign-out link: SignOutLink removes this
          device's push token and the desktop's windows first. */}
      <SignOutLink className={row}>
        <LogOut aria-hidden className="size-4" />
        Log off
      </SignOutLink>
    </div>
  );
}

/** The bottom bar: Home, Open programs, the inbox bell and Today. */
export function PhoneBar({
  hidden,
  openCount,
  switcherOpen,
  todayOpen,
  todayCount,
  onHome,
  onSwitcher,
  onToday,
  bell,
}: {
  /** The soft keyboard is up: nothing fixed rides over the field. */
  hidden: boolean;
  openCount: number;
  switcherOpen: boolean;
  todayOpen: boolean;
  /** Things due today, when the page said. */
  todayCount?: number;
  onHome: () => void;
  onSwitcher: () => void;
  onToday: () => void;
  /** The inbox bell, as the tray draws it. */
  bell: ReactNode;
}) {
  const cell =
    "relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 border font-pixel text-[10px] uppercase outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-primary";
  const idle = "border-os-line bg-os-panel text-os-fg";
  const on = "border-os-primary bg-os-primary text-os-primary-fg";
  return (
    <div
      role="toolbar"
      aria-label="Bottom bar"
      hidden={hidden}
      data-os-phone-bar
      className="fixed inset-x-0 bottom-0 z-[90] flex select-none items-center gap-1 border-t border-os-primary/60 bg-os-chrome px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <button
        type="button"
        onClick={onHome}
        className={`${cell} ${idle}`}
        aria-label="Home"
      >
        <House aria-hidden className="size-4" />
        Home
      </button>
      <button
        type="button"
        onClick={onSwitcher}
        aria-expanded={switcherOpen}
        aria-label={`Open programs, ${openCount}`}
        className={`${cell} ${switcherOpen ? on : idle}`}
      >
        <span className="relative">
          <Layers aria-hidden className="size-4" />
          {openCount > 0 && (
            <span
              aria-hidden
              className="absolute -right-3 -top-1.5 grid h-4 min-w-4 place-items-center border border-current bg-os-bg px-0.5 font-mono text-[10px] leading-none text-os-fg"
            >
              {openCount}
            </span>
          )}
        </span>
        Programs
      </button>
      <div className="flex h-12 min-w-11 flex-1 items-center justify-center border border-os-line bg-os-panel">
        {bell}
      </div>
      <button
        type="button"
        onClick={onToday}
        aria-expanded={todayOpen}
        aria-label={todayCount ? `Today, ${todayCount} due` : "Today"}
        className={`${cell} ${todayOpen ? on : idle}`}
      >
        <Sun aria-hidden className="size-4" />
        Today
      </button>
    </div>
  );
}

/**
 * A sheet over the home screen, above the bottom bar: a title bar with a
 * big Back and the name, then its body, scrolling on its own. `short`
 * rises from the bottom up to 80% of the height (Today); otherwise it fills
 * the screen (the open-programs list).
 */
export function PhoneSheet({
  title,
  onClose,
  short = false,
  children,
}: {
  title: string;
  onClose: () => void;
  short?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <section
      ref={ref}
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
      className={`os-window-in fixed inset-x-0 bottom-[var(--os-phone-bar,0px)] z-[85] flex flex-col border-t border-os-primary bg-os-panel outline-none md:hidden ${
        short ? "max-h-[80dvh]" : "top-0"
      }`}
    >
      {short && (
        <span
          aria-hidden
          className="mx-auto mt-1.5 h-1 w-10 shrink-0 bg-os-line"
        />
      )}
      <div className="flex h-12 shrink-0 select-none items-center gap-2 border-b border-os-line pr-1">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="flex h-12 min-w-11 shrink-0 items-center gap-1 pl-2 pr-3 font-pixel text-xs uppercase text-os-fg hover:bg-os-bg/30"
        >
          <ChevronLeft aria-hidden className="size-5" />
          Back
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-pixel text-sm uppercase tracking-[0.15em] text-os-fg">
          {title}
        </span>
        <span aria-hidden className="w-[4.75rem] shrink-0" />
      </div>
      <div className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}

/** One open window in the open-programs list. */
export interface SwitcherRow {
  id: string;
  label: string;
  icon: ReactNode;
  /** It is the one on screen now. */
  current: boolean;
}

/** The open-programs list: each window by its plain name, to go to or close. */
export function PhoneSwitcher({
  rows,
  onPick,
  onCloseWindow,
}: {
  rows: readonly SwitcherRow[];
  onPick: (id: string) => void;
  onCloseWindow: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-5 text-sm text-os-muted">
        Nothing is open. Programs you open stay here until you close them.
      </p>
    );
  }
  return (
    <ul aria-label="Open programs" className="flex flex-col">
      {rows.map((row) => (
        <li key={row.id} className="flex items-stretch border-b border-os-line">
          <button
            type="button"
            onClick={() => onPick(row.id)}
            aria-current={row.current || undefined}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 text-left text-sm text-os-fg hover:bg-os-bg/40"
          >
            {row.icon}
            <span className="truncate">{row.label}</span>
            {row.current && (
              <span className="ml-auto shrink-0 font-mono text-[10px] uppercase text-os-muted">
                On screen
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onCloseWindow(row.id)}
            aria-label={`Close ${row.label}`}
            className="grid w-12 shrink-0 place-items-center border-l border-os-line text-lg text-os-muted hover:text-os-fg"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
