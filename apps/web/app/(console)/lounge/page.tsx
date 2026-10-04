import Link from "next/link";
import { Printer } from "lucide-react";
import { canRunLounge, loungeDayOf, loungeDays } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { MarkdownBody } from "@/components/announcements/markdown-body";
import { EventGuide } from "@/components/lounge/event-guide";
import {
  MusicNoteButton,
  OfferButton,
} from "@/components/lounge/lounge-controls";
import { LoungeCard, LoungeCardHeader } from "@/components/lounge/lounge-parts";
import { LoungeTabs, type LoungeTab } from "@/components/lounge/lounge-tabs";
import { SearchFocus } from "@/components/search/search-focus";
import { MyOffers } from "@/components/lounge/my-offers";
import {
  OffersTable,
  type OfferRowData,
} from "@/components/lounge/offers-table";
import { ProgrammeDay } from "@/components/lounge/programme-day";
import { getCampSettings } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getLoungeProgramme,
  getLoungeSettings,
  listLoungeOffers,
  listMyLoungeOffers,
} from "@/lib/lounge";
import { LOUNGE_PRINT_PATH } from "@/lib/lounge-copy";
import {
  buildProgramme,
  dayHeadings,
  filterCounts,
  guideEntries,
  offerStage,
  openingDay,
  STAGE_ORDER,
} from "@/lib/lounge-view";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lounge — Camp 404" };

// The Ministry of Vibes' lounge (#269), redesigned to the owner's approved
// option A (2026-10-01, design/approved2-lounge.html; the design audit's
// Lounge findings): tabs instead of one long page. Every approved member
// gets the Programme (one day at a time) and My offers. A captain or a
// Ministry of Vibes lead (canRunLounge, owner 2026-09-27: "a lead of that
// team or a captain") also gets Offers (a status filter over one table, the
// next step in one fixed column, placing under the row) and the Event guide,
// and lands on Offers when anything waits on them. Other members' offers are
// never sent to a member's page: the list is read only for someone who runs
// the lounge, and so are the clash warnings and the host's wishes.

type TabValue = "programme" | "mine" | "offers" | "guide";

export default async function LoungePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; offer?: string }>;
}) {
  // Every approved member reads the programme.
  const { campUser, rank } = await captainPageGate("camp_member");
  const [camp, leadTeams, params] = await Promise.all([
    getCampSettings(),
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
    searchParams,
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
  const days = loungeDays(burn);
  // "Day 3 · Wed 29 Apr" once the dates are set: hosts and the Ministry
  // both say "Day 3", and the date tells a host which day that is.
  const dayOptions = days.map((d) => ({ day: d.day, short: d.label }));
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

  const rows: OfferRowData[] = all
    .map((o): OfferRowData => {
      const slots = programme.slots
        .filter((s) => s.offerId === o.id)
        .map((s) => ({ id: s.id, day: s.day, startMinute: s.startMinute }));
      return {
        id: o.id,
        version: o.version,
        status: o.status,
        stage: offerStage(o.status, slots.length),
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
        hostName: o.hostName,
        decisionNote: o.decisionNote,
        slots,
      };
    })
    // Oldest first within a stage (the list comes oldest first).
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);
  const counts = filterCounts(rows.map((r) => r.stage));
  const placed = view.items.map((i) => ({
    id: i.id,
    offerId: i.offerId,
    day: i.day,
    startMinute: i.startMinute,
    durationMinutes: i.durationMinutes,
    title: i.title,
  }));
  const toChange = mine.filter((o) => o.status === "needs_changes").length;

  // `?offer=` (a Ctrl+K result, #326): the tab and day that show that offer
  // to this viewer, checked against what the page already read for them.
  // Someone who runs the lounge sees it in Offers; a host in My offers;
  // anyone else on the programme, on its first day.
  const asked = params.offer;
  const focus: { tab: TabValue; day?: number } | null = !asked
    ? null
    : canRun && rows.some((r) => r.id === asked)
      ? { tab: "offers" }
      : mine.some((o) => o.id === asked)
        ? { tab: "mine" }
        : view.items.some((i) => i.offerId === asked)
          ? {
              tab: "programme",
              day: Math.min(
                ...view.items
                  .filter((i) => i.offerId === asked)
                  .map((i) => i.day),
              ),
            }
          : null;
  const focusOffer = focus ? asked : undefined;

  const music =
    settings.musicPolicy || canRun ? (
      <LoungeCard labelledBy="lounge-music-title" testId="music-note">
        <LoungeCardHeader
          id="lounge-music-title"
          title="Music in the lounge"
          aside={
            canRun ? (
              <MusicNoteButton
                key={settings.version}
                policy={settings.musicPolicy}
                version={settings.version}
              />
            ) : undefined
          }
        />
        <div className="px-4 py-4 text-sm leading-5">
          {settings.musicPolicy ? (
            <MarkdownBody className="text-sm">
              {settings.musicPolicy}
            </MarkdownBody>
          ) : (
            <p className="text-muted-foreground">
              No music note yet. DJs read it when they offer a set.
            </p>
          )}
        </div>
      </LoungeCard>
    ) : null;

  const tabs: (LoungeTab & { value: TabValue })[] = [
    {
      value: "programme",
      label: "Programme",
      panel: (
        <div className="flex flex-col gap-4">
          <ProgrammeDay
            days={dayHeadings(days)}
            items={view.items}
            canRun={canRun}
            initialDay={focus?.day ?? openingDay(view.items, days, today)}
            today={today}
            focusOffer={focusOffer}
          />
          {canRun && view.offGrid.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Not shown, on a day after the Burn&apos;s last day:{" "}
              {view.offGrid.map((i) => `${i.title} (day ${i.day})`).join(", ")}.
            </p>
          )}
          {music}
        </div>
      ),
    },
    {
      value: "mine",
      label: "My offers",
      count: toChange,
      panel: (
        <MyOffers
          offers={mine}
          slots={programme.slots}
          days={dayOptions}
          musicPolicy={settings.musicPolicy}
          focusOffer={focusOffer}
        />
      ),
    },
  ];
  if (canRun) {
    tabs.push(
      {
        value: "offers",
        label: "Offers",
        count: counts.act,
        panel: (
          <OffersTable
            rows={rows}
            days={days.map((d) => ({ day: d.day, label: d.label }))}
            placed={placed}
            initialFilter={focusOffer ? "all" : counts.act > 0 ? "act" : "all"}
            focusOffer={focusOffer}
          />
        ),
      },
      {
        value: "guide",
        label: "Event guide",
        panel: <EventGuide entries={guideEntries(programme, days)} />,
      },
    );
  }
  const askedTab = tabs.find((t) => t.value === params.tab)?.value;
  const initial: TabValue =
    focus?.tab ??
    askedTab ??
    (canRun && counts.act > 0 ? "offers" : "programme");

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Ministry of Vibes"
        title="Lounge"
        actionsBesideTitle
        description={
          <>
            What&apos;s on in the lounge, day by day.
            <span className="hidden page-sm:inline">
              {" "}
              Offer an activity or a DJ set; the Ministry of Vibes accepts it
              and puts it on the programme.
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon" className="h-9 w-9">
              <Link
                href={LOUNGE_PRINT_PATH}
                aria-label="Print the programme"
                title="Print the programme (A4)"
              >
                <Printer aria-hidden />
              </Link>
            </Button>
            <OfferButton days={dayOptions} musicPolicy={settings.musicPolicy} />
          </div>
        }
      />
      {/* A new search result opens the tabs afresh on its offer. */}
      <LoungeTabs
        key={`tabs:${focusOffer ?? ""}`}
        tabs={tabs}
        initial={initial}
      />
      {focusOffer && <SearchFocus key={`focus:${focusOffer}`} />}
    </div>
  );
}
