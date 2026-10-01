import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { campDayKey } from "@camp404/core";
import { SHIFT_MINIMUM } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import { AskShifts } from "@/components/shifts/shift-controls";
import { ShiftDay } from "@/components/shifts/shift-day";
import { ShiftTypesTable } from "@/components/shifts/shift-types-table";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getShiftsView,
  isAskedForShifts,
  type ShiftDayView,
  type ShiftsView,
} from "@/lib/shifts";
import {
  LOGISTICS_PATH,
  MY_SHIFTS_PATH,
  PAPER_NOTE,
  SHIFTS_PATH,
  SHIFTS_PRINT_PATH,
} from "@/lib/shifts-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shifts — Camp 404" };

// The shift roster (#248). Every approved member reads it and signs up here,
// BEFORE the burn; it is printed for site, and changes on site go on the paper
// (owner, 2026-09-30: there is no internet out there). Composed as the owner
// approved it (Option A, 2026-10-01): the day tabs, then the day as
// AfrikaBurn's ResponsiveDataTable with the member's own button in the same
// right-hand slot on every row and the lead tools in a panel a lead opens
// with the row's arrow (components/shifts/shift-day.tsx); then the year's
// shifts in the same table style; then, for leads and captains, who has how
// many.

function pickDay(
  days: ShiftDayView[],
  asked: string | undefined,
  today: string,
) {
  return (
    days.find((d) => d.day === asked) ??
    days.find((d) => d.day >= today) ??
    days[0] ??
    null
  );
}

function DayTabs({ days, current }: { days: ShiftDayView[]; current: string }) {
  return (
    <nav aria-label="Burn days" className="flex gap-1 overflow-x-auto">
      {days.map((d) => {
        const on = d.day === current;
        return (
          <Link
            key={d.day}
            href={`${SHIFTS_PATH}?day=${d.day}`}
            aria-current={on ? "page" : undefined}
            aria-label={d.label}
            scroll={false}
            className={cn(
              "inline-flex h-8 flex-none items-center border px-3 text-[13px] font-semibold whitespace-nowrap",
              on
                ? "border-primary bg-primary/25"
                : "border-border bg-card hover:bg-foreground/5",
            )}
          >
            {d.tab}
          </Link>
        );
      })}
    </nav>
  );
}

function Fairness({ view }: { view: ShiftsView }) {
  if (!view.fairness) return null;
  const below = view.fairness.filter((r) => r.below);
  return (
    <section className="border border-border bg-card">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-sans text-base font-semibold tracking-normal normal-case">
            Who has how many
          </h2>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Everyone who is coming, counted from the roster. The camp asks for
            at least {SHIFT_MINIMUM} each. Leads and captains see this.
          </p>
        </div>
        {view.fairness.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has said they are coming yet.
          </p>
        ) : (
          <>
            <p className="text-sm" data-testid="below-minimum">
              {below.length === 0
                ? `Everyone has ${SHIFT_MINIMUM} or more.`
                : `${below.length} of ${view.fairness.length} below ${SHIFT_MINIMUM}.`}
            </p>
            <ul
              aria-label="Shifts per member"
              className="grid gap-x-6 gap-y-1 page-sm:grid-cols-2 page-lg:grid-cols-3"
            >
              {view.fairness.map((r) => (
                <li
                  key={r.userId}
                  className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 text-sm"
                >
                  <span className={r.below ? "text-warning" : undefined}>
                    {r.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {view.days.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p id="open-places-title">Places still open each day</p>
            {/* One day per item, never split, so a wrapped line never starts
                with a stray separator. */}
            <ul
              aria-labelledby="open-places-title"
              className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums"
            >
              {view.days.map((d) => (
                <li key={d.day} className="whitespace-nowrap">
                  {d.tab}:{" "}
                  <span className="font-semibold text-foreground">
                    {d.openPlaces}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  // Every approved member reads the roster and signs up.
  const { campUser, rank } = await captainPageGate("camp_member");
  const [ledTeams, params, asked] = await Promise.all([
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
    searchParams,
    isAskedForShifts(campUser.id),
  ]);
  const view = await getShiftsView({ userId: campUser.id, rank, ledTeams });
  const today = campDayKey(new Date());
  const day = pickDay(view.days, params.day, today);
  // A member gets no lead-tools column at all; a lead or a captain does.
  const arrows = view.members !== null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp"
        title="Shifts"
        description={PAPER_NOTE}
        actions={
          <>
            {view.canAsk && <AskShifts />}
            {/* On a phone, My shifts and Print share the row half and half. */}
            <Button
              asChild
              variant="outline"
              className="flex-1 page-sm:flex-none"
            >
              <Link href={MY_SHIFTS_PATH}>My shifts</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="flex-1 page-sm:flex-none"
            >
              <Link
                href={`${SHIFTS_PRINT_PATH}${day ? `?day=${day.day}` : ""}`}
              >
                Print
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {view.reminder && (
          <p
            role="status"
            data-testid="shift-reminder"
            className="border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            {asked ? "The captains asked everyone who is coming. " : ""}
            {view.reminder}
          </p>
        )}

        {view.burnDays.length === 0 && (
          <p className="flex items-start gap-2 border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              The Burn&apos;s days aren&apos;t set yet, so there is no roster.
              Captains and Transport and Logistics leads set them on{" "}
              <Link href={LOGISTICS_PATH} className="underline">
                Logistics
              </Link>
              .
            </span>
          </p>
        )}

        {day && (
          <div className="flex flex-col gap-4">
            <DayTabs days={view.days} current={day.day} />
            <ShiftDay day={day} members={view.members} arrows={arrows} />
          </div>
        )}

        <ShiftTypesTable view={view} arrows={arrows} />
        <Fairness view={view} />
      </div>
    </div>
  );
}
