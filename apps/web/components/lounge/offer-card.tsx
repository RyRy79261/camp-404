import type { ReactNode } from "react";
import { durationText } from "@camp404/core";
import type { LoungeOfferStatus } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import type { LoungeOfferRow } from "@/lib/lounge";
import {
  KIND_LABELS,
  NEED_LABELS,
  STATUS_LABELS,
  bandsText,
} from "@/lib/lounge-copy";

// One lounge offer, as its host and the people who run the lounge read it
// (#269). Server-rendered; the actions come in as a slot.

const STATUS_VARIANT: Record<
  LoungeOfferStatus,
  "outline" | "success" | "warning" | "destructive"
> = {
  offered: "outline",
  accepted: "success",
  needs_changes: "warning",
  declined: "destructive",
};

export function OfferCard({
  offer,
  dayLabel,
  showHost,
  placedAt,
  actions,
}: {
  offer: LoungeOfferRow;
  dayLabel: (day: number) => string;
  showHost: boolean;
  /** Where it is on the programme, one line per placement. */
  placedAt: string[];
  actions?: ReactNode;
}) {
  const needs = [
    ...offer.needs.map((n) => NEED_LABELS[n]),
    ...(offer.needsNote ? [offer.needsNote] : []),
  ];
  const facts: [string, string][] = [
    ["How long", durationText(offer.durationMinutes)],
    ...(needs.length > 0
      ? ([["Needs", needs.join(", ")]] as [string, string][])
      : []),
    [
      "Days",
      offer.preferredDays.length > 0
        ? offer.preferredDays.map(dayLabel).join(", ")
        : "Any day",
    ],
    [
      "Times",
      offer.preferredBands.length > 0
        ? bandsText(offer.preferredBands)
        : "Any time",
    ],
  ];
  return (
    <li
      data-testid="lounge-offer"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold break-words">{offer.title}</h3>
          {showHost && (
            <p className="text-xs text-muted-foreground">
              Offered by {offer.hostName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{KIND_LABELS[offer.kind]}</Badge>
          <Badge variant={STATUS_VARIANT[offer.status]}>
            {STATUS_LABELS[offer.status]}
          </Badge>
        </div>
      </div>
      {offer.description && (
        <p className="text-sm whitespace-pre-line text-muted-foreground">
          {offer.description}
        </p>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        {(offer.recurring || offer.publicGuide) && (
          <div className="contents">
            <dt className="text-muted-foreground">Also</dt>
            <dd>
              {[
                offer.recurring ? "Can run on more than one day" : null,
                offer.publicGuide ? "For the event guide" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </dd>
          </div>
        )}
        {placedAt.length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">On the programme</dt>
            <dd>{placedAt.join("; ")}</dd>
          </div>
        )}
      </dl>
      {offer.decisionNote &&
        (offer.status === "declined" || offer.status === "needs_changes") && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">
              {offer.status === "declined" ? "Why: " : "What to change: "}
            </span>
            {offer.decisionNote}
          </p>
        )}
      {actions && <div>{actions}</div>}
    </li>
  );
}
