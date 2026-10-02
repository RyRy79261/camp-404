import type { ReactNode } from "react";
import { Badge } from "@camp404/ui/components/badge";
import { cn } from "@camp404/ui/lib/utils";
import { STAGE_LABELS, type OfferStage } from "@/lib/lounge-view";

// The lounge's building blocks (redesign option A, owner 2026-10-01; mock-up
// design/approved2-lounge.html): a square card in the window's tint with a
// 56px header, the status chip whose words and colours are the same in the
// filter, the table and the member's cards, and the table cell classes the
// programme, the offers table and the event guide share. Server-safe.

/** A box in the window's tint, square like the OS. */
export function LoungeCard({
  children,
  className,
  labelledBy,
  testId,
}: {
  children: ReactNode;
  className?: string;
  /** Names the box as a region (its heading's id). */
  labelledBy?: string;
  testId?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={cn(
        "border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A box's header: a bold title (and a quiet note) left, a meta or button right. */
export function LoungeCardHeader({
  id,
  title,
  note,
  aside,
  className,
}: {
  id?: string;
  title: ReactNode;
  /** Quiet words beside the title ("3 hosts asked for it"). */
  note?: ReactNode;
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
      {/* A plain-face heading: the window skins h2 in the pixel face. */}
      <h3 id={id} className="text-sm leading-5 font-bold">
        {title}
        {note && (
          <span className="block text-[13px] font-medium text-muted-foreground page-sm:ml-2 page-sm:inline">
            {note}
          </span>
        )}
      </h3>
      {aside && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          {aside}
        </div>
      )}
    </div>
  );
}

const STAGE_COLOUR: Record<OfferStage, string> = {
  new: "text-primary",
  to_place: "text-info",
  on: "text-success",
  changes: "text-warning",
  declined: "text-destructive",
};

/**
 * The offer's status chip: New, Accepted, On, Changes asked, Declined. On the
 * host's own card a new offer reads "Waiting" (it is new to the Ministry, not
 * to them).
 */
export function StageBadge({
  stage,
  host = false,
}: {
  stage: OfferStage;
  host?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      data-stage={stage}
      className={cn(
        "border-current bg-transparent whitespace-nowrap",
        STAGE_COLOUR[stage],
      )}
    >
      {host && stage === "new" ? "Waiting" : STAGE_LABELS[stage]}
    </Badge>
  );
}

/** Table cells: the mock-up's 12px padding, 16px at the row's left edge. */
export const TABLE = "w-full table-fixed border-collapse text-sm leading-5";
export const TH =
  "border-b border-border px-3 py-3 text-left text-[11px] leading-4 font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase first:pl-4";
export const TD = "border-t border-border px-3 py-3 align-middle first:pl-4";
/** The free-time rows between items: quieter, on a darker tint. */
export const GAP_ROW =
  "bg-[color-mix(in_oklab,var(--color-background)_30%,var(--color-card))] text-[13px] text-muted-foreground";
/** The warm "▲" a runner sees on an overlap, with its words as a tooltip. */
export const WARN = "text-warning";

/** The blue box a decision's words sit in: "The Ministry asked …". */
export function NoteBox({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="border border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-muted))] p-3 text-[13px] leading-5"
    >
      <p className="font-bold">{title}</p>
      <p className="whitespace-pre-line">{children}</p>
    </div>
  );
}
