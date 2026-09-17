import Link from "next/link";
import { ArrowRight, Check, Clock, Lock } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { buttonVariants } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";
import { BlockingBadge } from "./blocking-chrome";

// One questionnaire in a member's queue, as a card row like the AfrikaBurn
// app's pending-questionnaires rows: the title, the Required/Optional badge and
// the date, and the way in. Used by the Overview's and the inbox's "needs your
// answer" lists and the completion screen.
//
// Status drives everything: a `next-up` row is a link to the form, the others
// are inert, and a locked row is dimmed.

export type QueueCardStatus = "next-up" | "complete" | "locked" | "expired";

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

const ICON: Record<QueueCardStatus, { icon: typeof Check; tone: string }> = {
  complete: { icon: Check, tone: "bg-success/15 text-success" },
  "next-up": { icon: ArrowRight, tone: "bg-accent/15 text-accent" },
  expired: { icon: Clock, tone: "bg-warning/15 text-warning" },
  locked: { icon: Lock, tone: "bg-muted text-muted-foreground" },
};

export function QueueCard({
  title,
  status,
  blocking,
  dueAt = null,
  completedAt = null,
  href,
}: {
  title: string;
  status: QueueCardStatus;
  blocking: boolean;
  dueAt?: Date | null;
  completedAt?: Date | null;
  /** The form. Only a `next-up` row links anywhere. */
  href?: string;
}) {
  const meta =
    status === "complete"
      ? completedAt
        ? `Done ${DAY_MONTH.format(completedAt)}`
        : "Done"
      : status === "expired"
        ? "Expired — contact a captain"
        : dueAt
          ? `Due ${DAY_MONTH.format(dueAt)}`
          : null;

  const { icon: Icon, tone } = ICON[status];
  const linkHref = status === "next-up" ? href : undefined;

  const body = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          tone,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-sm font-medium text-card-foreground">
          {title}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <BlockingBadge blocking={blocking} />
          {meta && (
            <span className="text-xs text-muted-foreground">{meta}</span>
          )}
        </div>
      </div>
      {linkHref && (
        // Drawn as the row's button; the whole card is the link.
        <span
          className={cn(
            buttonVariants({
              size: "sm",
              variant: blocking ? "default" : "secondary",
            }),
            "shrink-0",
          )}
        >
          {blocking ? "Complete now" : "Answer"}
        </span>
      )}
    </>
  );

  const frame =
    "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm";

  if (linkHref) {
    return (
      <Link
        href={linkHref}
        className={cn(
          frame,
          "transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div
      className={cn(
        frame,
        status === "locked" && "pointer-events-none opacity-55",
      )}
      aria-disabled={status === "locked" || undefined}
    >
      {body}
    </div>
  );
}
