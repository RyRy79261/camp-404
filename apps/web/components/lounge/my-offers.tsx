import { durationText } from "@camp404/core";
import type { LoungeOfferRow } from "@/lib/lounge";
import { SEARCH_FOCUS_CLASS, searchFocusProps } from "@/lib/search-focus";
import { KIND_LABELS, timeRangeText } from "@/lib/lounge-copy";
import { offerStage, wantsText } from "@/lib/lounge-view";
import { MyOfferActions, OfferButton } from "./lounge-controls";
import { LoungeCard, NoteBox, StageBadge } from "./lounge-parts";
import type { DayOption, EditableOffer } from "./offer-dialog";

// A member's own offers (redesign option A, owner 2026-10-01): one card per
// offer, the same shape every time. Title and status on top; what the
// Ministry asked (or why they declined) in the blue box; then the facts in a
// fixed label column, so every value starts at the same x on every card;
// then Withdraw and the one main button in the same two slots at the foot.
// No offers is one line, not a big empty box. Server-rendered.

/** The host's order: what waits on them first. */
const HOST_ORDER: Record<LoungeOfferRow["status"], number> = {
  needs_changes: 0,
  offered: 1,
  accepted: 2,
  declined: 3,
};

function editable(o: LoungeOfferRow): EditableOffer {
  return {
    id: o.id,
    version: o.version,
    kind: o.kind,
    title: o.title,
    description: o.description,
    durationMinutes: o.durationMinutes,
    needs: o.needs,
    needsNote: o.needsNote,
    preferredDays: o.preferredDays,
    preferredBands: o.preferredBands,
    recurring: o.recurring,
    publicGuide: o.publicGuide,
  };
}

export function MyOffers({
  offers,
  slots,
  days,
  musicPolicy,
  focusOffer,
}: {
  /** The offer a search result named (`?offer=`): its card is marked. */
  focusOffer?: string;
  offers: readonly LoungeOfferRow[];
  /** The programme's places, to say where each accepted offer is. */
  slots: readonly { offerId: string; day: number; startMinute: number }[];
  days: readonly DayOption[];
  musicPolicy: string | null;
}) {
  if (offers.length === 0) {
    return (
      <LoungeCard>
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            You haven&apos;t offered anything this year.
          </p>
          <OfferButton
            days={days}
            musicPolicy={musicPolicy}
            variant="outline"
          />
        </div>
      </LoungeCard>
    );
  }

  return (
    <ul
      aria-label="My offers"
      className="grid items-stretch gap-3 page-md:grid-cols-2"
    >
      {[...offers]
        .sort((a, b) => HOST_ORDER[a.status] - HOST_ORDER[b.status])
        .map((o) => {
          const mine = slots.filter((s) => s.offerId === o.id);
          const stage = offerStage(o.status, mine.length);
          const wants = wantsText(o);
          return (
            <li
              key={o.id}
              data-testid="my-offer"
              aria-label={o.title}
              {...searchFocusProps(o.id === focusOffer)}
              className={`flex flex-col gap-3 border border-border bg-card p-4 ${o.id === focusOffer ? SEARCH_FOCUS_CLASS : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base leading-5 font-semibold break-words">
                    {o.title}
                  </p>
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    {KIND_LABELS[o.kind]} · {durationText(o.durationMinutes)}
                  </p>
                </div>
                <StageBadge stage={stage} host />
              </div>
              {o.decisionNote && o.status === "needs_changes" && (
                <NoteBox title="The Ministry asked">{o.decisionNote}</NoteBox>
              )}
              {o.decisionNote && o.status === "declined" && (
                <NoteBox title="Why they declined">{o.decisionNote}</NoteBox>
              )}
              <dl className="grid grid-cols-[8rem_1fr] items-baseline gap-x-3 gap-y-2">
                <dt className="text-[13px] leading-5 text-muted-foreground">
                  You asked for
                </dt>
                <dd className="text-sm leading-5">
                  {wants.days} · {wants.times}
                </dd>
                <dt className="text-[13px] leading-5 text-muted-foreground">
                  On the programme
                </dt>
                <dd className="text-sm leading-5 tabular-nums">
                  {mine.length > 0 ? (
                    mine
                      .map(
                        (s) =>
                          `Day ${s.day} · ${timeRangeText(s.startMinute, o.durationMinutes)}`,
                      )
                      .join("; ")
                  ) : (
                    <span className="text-muted-foreground">
                      {o.status === "accepted" ? "Not placed yet" : "Not yet"}
                    </span>
                  )}
                </dd>
                {o.publicGuide && (
                  <>
                    <dt className="text-[13px] leading-5 text-muted-foreground">
                      Event guide
                    </dt>
                    <dd className="text-sm leading-5">Yes</dd>
                  </>
                )}
              </dl>
              <MyOfferActions
                offer={editable(o)}
                status={o.status}
                placed={mine.length > 0}
                askedNote={o.decisionNote}
                days={days}
                musicPolicy={musicPolicy}
              />
            </li>
          );
        })}
    </ul>
  );
}
