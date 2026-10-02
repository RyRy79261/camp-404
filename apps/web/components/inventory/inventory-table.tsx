import type { ReactNode } from "react";
import { cn } from "@camp404/ui/lib/utils";

// The inventory's table parts (#246, redesign option A, owner 2026-10-01).
// Copied from AfrikaBurn's Registrations list: ONE table per view with fixed
// column widths and the group (category, team, camp) as a header row inside
// it, so every column lines up from top to bottom; every row's one action in
// a fixed right-hand slot. From page-md down the same rows are a compact
// list (name over one quiet line, the action on the right). Server-safe: no
// state.

/** A box in the window's blue tint, square like the OS. */
export function InvCard({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Names the box as a region (its heading's id). */
  label?: string;
}) {
  return (
    <section
      aria-labelledby={label}
      className={cn(
        "border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A box's header: a pixel title on the left, quiet words and a button right. */
export function InvCardHeader({
  id,
  title,
  phoneTitle,
  aside,
  className,
}: {
  id: string;
  title: string;
  /** A shorter title for a phone, so the header stays one line. */
  phoneTitle?: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3",
        className,
      )}
    >
      <h2
        id={id}
        className="font-pixel text-[11px] font-normal tracking-[0.18em] uppercase"
      >
        {phoneTitle ? (
          <>
            {/* The full title stays the heading's name on a phone too. */}
            <span aria-hidden className="page-sm:hidden">
              {phoneTitle}
            </span>
            <span className="sr-only page-sm:not-sr-only">{title}</span>
          </>
        ) : (
          title
        )}
      </h2>
      {aside && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {aside}
        </div>
      )}
    </div>
  );
}

export const TABLE = "w-full table-fixed border-collapse text-sm";
export const TH =
  "border-b border-border px-4 py-3 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground";
export const TD = "border-t border-border px-4 py-3 align-middle leading-5";
/** The action column: the button fills a fixed-width slot. */
export const TD_ACTION = "border-t border-border py-3 pr-4 align-middle";
/** The narrow "···" column for a lead's tools. */
export const TD_MENU =
  "border-t border-border py-2 pr-2 text-right align-middle";

const GROUP_BG = "bg-[color-mix(in_oklab,var(--color-card)_70%,black)]";

/** A group's header row inside the one table: KITCHEN · 3 items. */
export function GroupRow({
  colSpan,
  title,
  aside,
}: {
  colSpan: number;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={colSpan}
        className={cn(
          GROUP_BG,
          "border-t border-border px-4 py-2 text-left font-pixel text-[10px] font-normal tracking-[0.18em] uppercase",
        )}
      >
        {title}
        {aside && (
          <span className="ml-2 font-sans text-xs tracking-normal text-muted-foreground normal-case">
            {aside}
          </span>
        )}
      </th>
    </tr>
  );
}

/** The same group header, in the phone list. */
export function GroupItem({
  title,
  aside,
}: {
  title: string;
  aside?: ReactNode;
}) {
  return (
    <li
      className={cn(
        GROUP_BG,
        "flex items-baseline gap-2 border-t border-border px-4 py-2 font-pixel text-[10px] tracking-[0.18em] uppercase first:border-t-0",
      )}
    >
      {title}
      {aside && (
        <span className="font-sans text-xs tracking-normal text-muted-foreground normal-case">
          {aside}
        </span>
      )}
    </li>
  );
}

/** The quiet line under a row's name. */
export function SubLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mt-0.5 block truncate text-xs leading-4 text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

const TONES = {
  ok: "text-success",
  warn: "text-warning",
  bad: "text-[color-mix(in_oklab,var(--color-destructive)_65%,white)]",
  mute: "text-muted-foreground",
} as const;

/** A state in words with a dot before it: "Broken", "Due 1 Mar". */
export function StatusText({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

/**
 * The action slot's quiet state, where a row has nothing to press:
 * "Covered", "Fully booked". Same size and place as the button it stands in
 * for.
 */
export function ActionSlot({
  tone = "mute",
  children,
}: {
  tone?: "ok" | "mute";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex h-8 w-full items-center justify-center gap-1.5 border border-dashed text-xs font-semibold whitespace-nowrap",
        tone === "ok"
          ? "border-[color-mix(in_oklab,var(--color-success)_40%,transparent)] text-success"
          : "border-[color-mix(in_oklab,var(--color-foreground)_28%,transparent)] text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** A thin bar: how much of a need is covered. */
export function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span
      aria-hidden
      className="mt-1.5 block h-1 bg-[color-mix(in_oklab,var(--color-foreground)_12%,transparent)]"
    >
      <span
        className={cn(
          "block h-full",
          pct >= 100
            ? "bg-success"
            : "bg-[var(--os-accent,var(--color-primary))]",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** A plain-words note in the choice tint: "A booking is one unit…". */
export function InfoNote({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-3 border border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-card))] px-4 py-3 text-sm leading-5",
        className,
      )}
    >
      {icon && (
        <span className="mt-0.5 hidden shrink-0 page-sm:block text-[var(--os-accent,var(--color-primary))] [&_svg]:size-4">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The line between the filters and the table: "9 items in 3 groups". */
export function CountLine({
  children,
  aside,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted-foreground",
        className,
      )}
    >
      <p>{children}</p>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </div>
  );
}
