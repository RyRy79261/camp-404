import type { ReactNode } from "react";
import { cn } from "@camp404/ui/lib/utils";
import type { Tone } from "@/lib/power-summary";

// The Power program's building blocks (the owner's approved redesign, option
// B, 2026-10-01: /home/ryan/camp404-night/design/approved2-power.html). Each
// section opens on its plain answer (Verdict), then the working in cards whose
// rows keep one fixed action column. Tokens only: the window's tinted card,
// the theme's main colour and the kit's success, warning and destructive
// colours, mixed toward the text so they read on the dark window.
//
// Below the page's 40rem (a phone, or a narrow window) a row drops its quiet
// columns and shows them as a second line instead: `wide` and `narrow` below.

/** Shown only from the page's 40rem up / only below it. */
export const wide = "hidden page-sm:block";
export const narrow = "page-sm:hidden";

// "Bad" is the kit's destructive red, lifted toward the text so it reads on
// the dark window. Written out whole: Tailwind finds a class only as a literal.
export const TONE_TEXT: Record<Tone, string> = {
  bad: "text-[color-mix(in_oklab,var(--color-destructive)_70%,var(--color-foreground))]",
  warn: "text-warning",
  ok: "text-success",
  info: "text-primary",
  mute: "text-muted-foreground",
};

const TONE_FILL: Record<Tone, string> = {
  bad: "bg-[color-mix(in_oklab,var(--color-destructive)_70%,var(--color-foreground))]",
  warn: "bg-warning",
  ok: "bg-success",
  info: "bg-primary",
  mute: "bg-muted-foreground",
};

const TONE_EDGE: Record<Tone, string> = {
  bad: "border-[color-mix(in_oklab,var(--color-destructive)_70%,var(--color-foreground))]",
  warn: "border-warning/60",
  ok: "border-success/60",
  info: "border-primary/60",
  mute: "border-border",
};

/** A small round status mark. `neutral` is the desktop's blue. */
export function Dot({ tone }: { tone: Tone | "neutral" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "neutral" ? "bg-[var(--os-accent)]" : TONE_FILL[tone],
      )}
    />
  );
}

/** A thin bar, filled to `pct` (capped at 100). */
export function Bar({
  pct,
  tone = "neutral",
  className,
}: {
  pct: number;
  tone?: Tone | "neutral";
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <span
      aria-hidden
      className={cn(
        "block h-2 w-full overflow-hidden bg-foreground/10",
        className,
      )}
    >
      <span
        className={cn(
          "block h-full",
          tone === "neutral" ? "bg-[var(--os-accent)]" : TONE_FILL[tone],
        )}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** A square outlined chip in the pixel face: "Over", "Near limit", "Doing". */
export function Chip({
  tone = "mute",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap border px-1.5 py-0.5 font-pixel text-[9px] uppercase leading-3 tracking-[0.12em]",
        TONE_EDGE[tone],
        TONE_TEXT[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A section's own heading row: its name, one plain line, its buttons. */
export function SectionHead({
  title,
  sentence,
  actions,
}: {
  title: string;
  sentence: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 page-sm:flex-row page-sm:items-end page-sm:justify-between page-sm:gap-4">
      <div className="min-w-0">
        <h2 className="mb-1 font-pixel text-xs uppercase leading-4 tracking-[0.2em]">
          {title}
        </h2>
        <p className="max-w-[520px] text-[13px] leading-5 text-muted-foreground">
          {sentence}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-col-reverse gap-2 page-sm:flex-row page-sm:items-center [&_[data-slot=button]]:h-10 [&_[data-slot=button]]:w-full page-sm:[&_[data-slot=button]]:h-8 page-sm:[&_[data-slot=button]]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

/** A box inside the window: the tinted card, square, with a soft edge. */
export function PowerCard({
  className,
  children,
  label,
}: {
  className?: string;
  children: ReactNode;
  /** Names the box for a screen reader (a region). */
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("mb-4 border border-border bg-card", className)}
    >
      {children}
    </section>
  );
}

/** A section's answer: one plain sentence, then a gauge and a legend. */
export function Verdict({
  children,
  gauge,
  legend,
  note,
}: {
  children: ReactNode;
  gauge?: { pct: number; tone?: Tone | "neutral"; label: string };
  legend?: { tone: Tone | "neutral"; text: string }[];
  note?: ReactNode;
}) {
  return (
    <PowerCard className="flex flex-col gap-3 p-4" label="The answer">
      <p className="text-[17px] font-medium leading-6 page-sm:text-xl page-sm:leading-7 [&_b]:font-extrabold">
        {children}
      </p>
      {note && (
        <p className="text-[13px] leading-5 text-muted-foreground">{note}</p>
      )}
      {gauge && (
        <div className="grid grid-cols-[1fr_48px] items-center gap-3 text-right font-bold tabular-nums">
          <Bar pct={gauge.pct} tone={gauge.tone} className="h-3" />
          <span>{gauge.label}</span>
        </div>
      )}
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-4 text-muted-foreground">
          {legend.map((item) => (
            <li key={item.text} className="flex items-center gap-2">
              <Dot tone={item.tone} />
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </PowerCard>
  );
}

/** A card's own heading: a title, a quiet line, and its buttons on the right. */
export function CardHead({
  title,
  meta,
  actions,
  flat = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Inside a padded card: no padding of its own, a rule under it. */
  flat?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border",
        flat ? "mb-4 pb-3" : "min-h-14 px-3 py-3 page-sm:px-4",
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-5">{title}</h3>
        {meta && (
          <span className="mt-1 block text-xs leading-4 text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-2 page-sm:w-auto page-sm:flex-row [&_[data-slot=button]]:h-10 page-sm:[&_[data-slot=button]]:h-8">
          {actions}
        </div>
      )}
    </div>
  );
}

/** A band between groups of rows: "KITCHEN · 2,760 W". */
export function GroupHead({
  label,
  figure,
}: {
  label: string;
  figure?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-t border-border bg-foreground/[0.04] px-3 py-2 font-pixel text-[9px] uppercase leading-4 tracking-[0.14em] text-muted-foreground first:border-t-0 page-sm:px-4">
      <span>{label}</span>
      {figure && (
        <span className="font-sans text-xs normal-case tracking-normal">
          {figure}
        </span>
      )}
    </div>
  );
}

/** One row of a list card. `cols` is its grid, narrow first then wide. */
export function Row({
  cols,
  className,
  children,
  label,
}: {
  cols: string;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      role="listitem"
      aria-label={label}
      className={cn(
        "grid min-h-14 items-center gap-3 border-t border-border px-3 py-3 text-sm leading-5 first:border-t-0 page-sm:px-4",
        cols,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A row's header line, in small capitals. */
export function HeadRow({
  cols,
  children,
}: {
  cols: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid min-h-10 items-center gap-3 px-3 py-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground page-sm:px-4",
        cols,
      )}
    >
      {children}
    </div>
  );
}

/** A row's name and the quiet line under it. */
export function RowName({
  name,
  sub,
  muted = false,
}: {
  name: ReactNode;
  sub?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "font-semibold",
          muted && "font-medium text-muted-foreground",
        )}
      >
        {name}
      </div>
      {sub && (
        <div className="mt-1 text-xs font-normal leading-4 text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

/** The quiet line at the foot of a card. */
export function CardFoot({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border px-3 py-3 text-[13px] leading-5 text-muted-foreground page-sm:px-4">
      {children}
    </div>
  );
}

/** Nothing here yet: one bold line and what to do. */
export function EmptyNote({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-3 py-4 text-sm leading-5 page-sm:px-4 page-sm:py-6">
      <b>{title}</b>
      {children && (
        <span className="max-w-[520px] text-[13px] text-muted-foreground">
          {children}
        </span>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A row of label and figure, as the fuel page's working. */
export function Ledger({
  rows,
}: {
  rows: { label: string; figure: string; total?: boolean }[];
}) {
  return (
    <dl className="flex flex-col">
      {rows.map((r) => (
        <div
          key={r.label}
          className={cn(
            "flex justify-between gap-4 border-t py-2 text-sm leading-5 first:border-t-0",
            r.total ? "border-t-2 border-border" : "border-border",
          )}
        >
          <dt className={r.total ? "font-semibold" : "text-muted-foreground"}>
            {r.label}
          </dt>
          <dd className="font-semibold tabular-nums">{r.figure}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A two-column list of a record's facts. */
export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-3 page-sm:grid-cols-2 page-sm:gap-x-8 page-sm:gap-y-4">
      {items.map((f) => (
        <div key={f.label}>
          <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">
            {f.label}
          </dt>
          <dd className="mt-1 text-sm leading-5">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
