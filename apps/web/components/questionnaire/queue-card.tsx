import Link from "next/link";
import { ArrowRight, Check, Clock, Lock } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { IconBadge } from "@camp404/ui/components/icon-badge";
import { cn } from "@camp404/ui/lib/utils";
import { BlockingBadge } from "./blocking-chrome";

// One questionnaire in a member's queue: board S27 "Required Queue List" rows,
// on the Card leaf (design/spec/impl/components/molecule-queuecard.md). Used by
// the inbox's "Needs your answer" section and the S27 completion screen.
//
// Status drives everything: a `next-up` row is a link to the form, the others
// are inert. The board draws a locked row at 55% opacity.

export type QueueCardStatus = "next-up" | "complete" | "locked" | "expired";

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

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

  const body = (
    <>
      <IconBadge
        size="sm"
        tone={
          status === "complete"
            ? "accent"
            : status === "next-up"
              ? "primary"
              : status === "expired"
                ? "warning"
                : "muted"
        }
      >
        {status === "complete" ? (
          <Check aria-hidden />
        ) : status === "next-up" ? (
          <ArrowRight aria-hidden />
        ) : status === "expired" ? (
          <Clock aria-hidden />
        ) : (
          <Lock aria-hidden />
        )}
      </IconBadge>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-bold text-card-foreground">
            {title}
          </span>
          <BlockingBadge blocking={blocking} />
        </div>
        {meta && (
          <span className="text-caption text-muted-foreground">{meta}</span>
        )}
      </div>
    </>
  );

  const frame =
    "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4";

  if (status === "next-up" && href) {
    return (
      <Link
        href={href}
        className={cn(
          frame,
          "transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
