import Link from "next/link";
import { Inbox, Lock, Music, Printer } from "lucide-react";
import {
  canRunLounge,
  loungeDayOf,
  loungeDays,
  type LoungeDay,
} from "@camp404/core";
import type { LoungeOfferStatus } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  CopyGuideButton,
  MusicNoteButton,
  MyOfferActions,
  OfferButton,
  PlaceButton,
  ReviewActions,
  type PlacedLite,
} from "@/components/lounge/lounge-controls";
import { OfferCard } from "@/components/lounge/offer-card";
import type { EditableOffer } from "@/components/lounge/offer-dialog";
import { ProgrammeGrid } from "@/components/lounge/programme-grid";
import { getCampSettings } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getLoungeProgramme,
  getLoungeSettings,
  listLoungeOffers,
  listMyLoungeOffers,
  type LoungeOfferRow,
  type LoungeSlotRow,
} from "@/lib/lounge";
import {
  KIND_LABELS,
  LOUNGE_PRINT_PATH,
  LOUNGE_REFUSAL,
  timeRangeText,
} from "@/lib/lounge-copy";
import { buildProgramme, guideEntries, guideText } from "@/lib/lounge-view";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lounge programme — Camp 404" };

// The Ministry of Vibes' lounge programme (#269). Every approved member reads
// the programme, offers an activity or a DJ set, and changes or withdraws
// their own offers. A captain or a Ministry of Vibes lead (canRunLounge, owner
// 2026-09-27: "a lead of that team or a captain") also sees every offer,
// decides them, places the accepted ones and writes the music note. Other
// members' offers are never sent to a member's page: the list is read only
// for someone who runs the lounge.
//
// Composed from the power load list: the heading's actions, one Lock line for
// who may change the programme, then the programme (the whiteboard grid),
// the member's own offers, the offers to decide and the event guide list.

const REFUSAL_ID = "lounge-run-refusal";

const REVIEW_GROUPS: { status: LoungeOfferStatus; title: string }[] = [
  { status: "offered", title: "Waiting for a decision" },
  { status: "needs_changes", title: "Changes asked for" },
  { status: "accepted", title: "Accepted" },
  { status: "declined", title: "Declined" },
];

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

function placements(
  offer: LoungeOfferRow,
  slots: readonly LoungeSlotRow[],
  labelOf: (day: number) => string,
): string[] {
  return slots
    .filter((s) => s.offerId === offer.id)
    .map(
      (s) =>
        `${labelOf(s.day)}, ${timeRangeText(s.startMinute, offer.durationMinutes)}`,
    );
}

function Section({
  id,
  title,
  meta,
  action,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function LoungePage() {
  // Every approved member reads the programme.
  const { campUser, rank } = await captainPageGate("camp_member");
  const [camp, leadTeams] = await Promise.all([
    getCampSettings(),
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
  ]);
  const canRun = canRunLounge(rank, leadTeams);
  const cycle = camp.cycleNumber;
  const [programme, mine, all, settings] = await Promise.all([
    getLoungeProgramme(cycle),
    listMyLoungeOffers(campUser.id, cycle),
    // Everyone's offers, only for someone who runs the lounge.
    canRun ? listLoungeOffers(cycle) : Promise.resolve([]),
    getLoungeSettings(cycle),
  ]);

  const burn =
    camp.current?.burnStart && camp.current.burnEnd
      ? { start: camp.current.burnStart, end: camp.current.burnEnd }
      : null;
  const days: LoungeDay[] = loungeDays(burn);
  const labelOf = (day: number) =>
    days.find((d) => d.day === day)?.label ?? `Day ${day}`;
  const dayOptions = days.map((d) => ({ day: d.day, short: d.short }));
  const today = loungeDayOf(new Date(), days);

  const view = buildProgramme(
    programme,
    days,
    canRun
      ? new Map(
          all.map((o) => [
            o.id,
            {
              preferredDays: o.preferredDays,
              preferredBands: o.preferredBands,
            },
          ]),
        )
      : undefined,
  );
  const placedLite: PlacedLite[] = view.items.map((i) => ({
    id: i.id,
    day: i.day,
    startMinute: i.startMinute,
    durationMinutes: i.durationMinutes,
    title: i.title,
  }));
  const guide = guideEntries(programme, days);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Ministry of Vibes"
        title="Lounge programme"
        description="What's on in the lounge, day by day. Anyone can offer an activity or a DJ set; captains and Ministry of Vibes leads accept offers and place them."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={LOUNGE_PRINT_PATH}>
                <Printer aria-hidden />
                Print
              </Link>
            </Button>
            {canRun && (
              <MusicNoteButton
                key={settings.version}
                policy={settings.musicPolicy}
                version={settings.version}
              />
            )}
            <OfferButton days={dayOptions} musicPolicy={settings.musicPolicy} />
          </div>
        }
      />

      <div className="flex flex-col gap-8">
        {settings.musicPolicy && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Music
              className="mt-0.5 h-4 w-4 shrink-0 text-accent"
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Music in the lounge</p>
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {settings.musicPolicy}
              </p>
            </div>
          </div>
        )}

        <Section
          id="programme"
          title="Programme"
          meta={`${view.items.length} on the programme${burn ? "" : " · days are numbered until the Burn's dates are set"}`}
        >
          {!canRun && (
            <p
              id={REFUSAL_ID}
              className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {LOUNGE_REFUSAL}
            </p>
          )}
          <ProgrammeGrid
            view={view}
            days={days}
            canRun={canRun}
            today={today}
          />
          {view.offGrid.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Not shown, on a day after the Burn&apos;s last day:{" "}
              {view.offGrid.map((i) => `${i.title} (day ${i.day})`).join(", ")}.
            </p>
          )}
        </Section>

        <Section id="my-offers" title="Your offers">
          {mine.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="You haven't offered anything yet"
              description="Offer an activity, a workshop or a DJ set. The Ministry of Vibes answers here."
            />
          ) : (
            <ul className="grid gap-3 page-lg:grid-cols-2">
              {mine.map((o) => {
                const at = placements(o, programme.slots, labelOf);
                return (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    dayLabel={labelOf}
                    showHost={false}
                    placedAt={at}
                    actions={
                      <MyOfferActions
                        offer={editable(o)}
                        status={o.status}
                        placed={at.length > 0}
                        days={dayOptions}
                        musicPolicy={settings.musicPolicy}
                      />
                    }
                  />
                );
              })}
            </ul>
          )}
        </Section>

        {canRun && (
          <Section
            id="offers"
            title="Offers"
            meta={`${all.filter((o) => o.status === "offered").length} waiting`}
          >
            {all.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="No offers yet"
                description="When a member offers an activity or a DJ set, it shows here to accept and place."
              />
            ) : (
              REVIEW_GROUPS.map(({ status, title }) => {
                const group = all.filter((o) => o.status === status);
                if (group.length === 0) return null;
                return (
                  <div key={status} className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {title} ({group.length})
                    </h3>
                    <ul
                      aria-label={title}
                      className="grid gap-3 page-lg:grid-cols-2"
                    >
                      {group.map((o) => {
                        const at = placements(o, programme.slots, labelOf);
                        return (
                          <OfferCard
                            key={o.id}
                            offer={o}
                            dayLabel={labelOf}
                            showHost
                            placedAt={at}
                            actions={
                              <span className="flex flex-wrap items-center gap-2">
                                {o.status === "accepted" && (
                                  <PlaceButton
                                    offer={{
                                      id: o.id,
                                      title: o.title,
                                      durationMinutes: o.durationMinutes,
                                      preferredDays: o.preferredDays,
                                      preferredBands: o.preferredBands,
                                    }}
                                    days={dayOptions}
                                    placed={placedLite}
                                  />
                                )}
                                <ReviewActions
                                  offer={{
                                    id: o.id,
                                    title: o.title,
                                    status: o.status,
                                    version: o.version,
                                    placed: at.length,
                                  }}
                                />
                              </span>
                            }
                          />
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </Section>
        )}

        <Section
          id="event-guide"
          title="For the AfrikaBurn event guide"
          action={
            guide.length > 0 ? (
              <CopyGuideButton text={guideText(guide)} />
            ) : undefined
          }
        >
          {guide.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Accepted offers whose hosts ticked &ldquo;event
              guide&rdquo; are listed here, ready to send in.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {guide.map((g) => (
                <li key={g.offerId} className="flex flex-col gap-1 px-4 py-3">
                  <p className="text-sm font-medium">
                    {g.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {KIND_LABELS[g.kind]}
                      {g.recurring ? " · recurring" : ""} · {g.hostName}
                    </span>
                  </p>
                  {g.description && (
                    <p className="text-sm text-muted-foreground">
                      {g.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {g.times.length > 0
                      ? g.times.join("; ")
                      : "Time not set yet"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
