import Link from "next/link";
import { CalendarDays, ClipboardList, Lock, Printer } from "lucide-react";
import { campDayKey } from "@camp404/core";
import { SHIFT_MINIMUM } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  AskShifts,
  FillDaysButton,
  NeededToggle,
  PutSomeoneOn,
  RemoveShiftButton,
  SignUpButton,
  TakeOffButton,
} from "@/components/shifts/shift-controls";
import { ShiftTypeDialog } from "@/components/shifts/shift-type-dialog";
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
  SHIFTS_REFUSAL,
  placesText,
} from "@/lib/shifts-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shifts — Camp 404" };

// The shift roster (#248). Every approved member reads it and signs up here,
// BEFORE the burn; it is printed for site, and changes on site go on the paper
// (owner, 2026-09-30: there is no internet out there). Composed as the
// logistics load list: one card per day of rows, one-tap controls per row,
// and for everyone who may not set shifts up, one Lock line. Below the day,
// the year's shift types (a captain or a lead of the shift's team sets each
// up), and for leads and captains, who has how many shifts.

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

function DayPicker({
  days,
  current,
}: {
  days: ShiftDayView[];
  current: string;
}) {
  return (
    <nav aria-label="Burn days" className="flex flex-wrap gap-2">
      {days.map((d) => {
        const on = d.day === current;
        return (
          <Button
            key={d.day}
            asChild
            size="sm"
            variant={on ? "default" : "outline"}
          >
            <Link
              href={`${SHIFTS_PATH}?day=${d.day}`}
              aria-current={on ? "page" : undefined}
              scroll={false}
            >
              {d.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function DayCard({
  day,
  members,
}: {
  day: ShiftDayView;
  members: ShiftsView["members"];
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-3">
          <h2 className="text-base font-semibold">{day.label}</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {day.openPlaces === 0
              ? "Every place taken"
              : `${day.openPlaces} ${day.openPlaces === 1 ? "place" : "places"} open`}
            {day.outsideBurn ? " · Not a Burn day any more" : ""}
          </span>
        </div>
        {day.slots.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
            No shifts on this day yet.
          </p>
        ) : (
          <ul
            aria-label={`Shifts on ${day.label}`}
            className="divide-y divide-border border-t border-border"
          >
            {day.slots.map((slot) => {
              const label = `${slot.type.name} on ${day.label}`;
              const needed = slot.status === "open";
              const full = slot.taken >= slot.type.places;
              return (
                <li
                  key={slot.id}
                  aria-label={label}
                  className="flex flex-col gap-2 px-4 py-3 page-sm:flex-row page-sm:items-start page-sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {slot.type.name}
                      </h3>
                      <Badge variant="outline">{slot.type.teamLabel}</Badge>
                      {slot.mine && <Badge variant="success">You</Badge>}
                    </div>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {slot.type.timeText}
                      {needed
                        ? ` · ${placesText(slot.taken, slot.type.places)}`
                        : ""}
                    </p>
                    {!needed ? (
                      <p className="text-sm text-muted-foreground">
                        Not needed this day.
                      </p>
                    ) : slot.people ? (
                      <ul
                        aria-label={`Who is on ${label}`}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        {slot.people.map((p) => (
                          <li
                            key={p.userId}
                            className="inline-flex items-center gap-0.5 rounded-md border border-border py-0.5 pl-2 text-sm"
                          >
                            {p.name}
                            {slot.open && (
                              <TakeOffButton
                                slotId={slot.id}
                                userId={p.userId}
                                name={p.name}
                              />
                            )}
                          </li>
                        ))}
                        {slot.people.length === 0 && (
                          <li className="text-sm text-muted-foreground">
                            Nobody yet.
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-sm" data-testid={`who-${slot.id}`}>
                        {slot.names.length > 0 ? (
                          slot.names.join(", ")
                        ) : (
                          <span className="text-muted-foreground">
                            Nobody yet.
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1 self-end page-sm:self-start">
                    {!slot.open ? (
                      <span className="text-xs text-muted-foreground">
                        On paper now
                      </span>
                    ) : (
                      <>
                        {needed && (
                          <SignUpButton
                            slotId={slot.id}
                            mine={slot.mine}
                            full={full}
                            label={label}
                          />
                        )}
                        {slot.type.canManage && members && needed && !full && (
                          <PutSomeoneOn
                            slotId={slot.id}
                            label={label}
                            members={members}
                            exclude={(slot.people ?? []).map((p) => p.userId)}
                          />
                        )}
                        {slot.type.canManage &&
                          (needed ? slot.taken === 0 : true) && (
                            <NeededToggle
                              slotId={slot.id}
                              version={slot.version}
                              needed={needed}
                              label={label}
                            />
                          )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ShiftTypes({ view }: { view: ShiftsView }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 page-sm:flex-row page-sm:items-start page-sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">The shifts</h2>
            <p className="text-sm text-muted-foreground">
              Each runs every day of the Burn unless a lead marks a day not
              needed.
            </p>
          </div>
          {view.teams.length > 0 && view.burnDays.length > 0 && (
            <div className="shrink-0">
              <ShiftTypeDialog teams={view.teams} />
            </div>
          )}
        </div>
        {view.types.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
            No shifts set up yet.
          </p>
        ) : (
          <ul
            aria-label="The shifts"
            className="divide-y divide-border border-t border-border"
          >
            {view.types.map((t) => (
              <li
                key={t.id}
                aria-label={t.name}
                className="flex flex-col gap-2 px-4 py-3 page-sm:flex-row page-sm:items-start page-sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    <Badge variant="outline">{t.teamLabel}</Badge>
                  </div>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {t.timeText} · {t.places}{" "}
                    {t.places === 1 ? "person" : "people"}
                  </p>
                  {t.note && (
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {t.note}
                    </p>
                  )}
                </div>
                {t.canManage && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1 self-end page-sm:self-start">
                    {t.missingDays > 0 && (
                      <FillDaysButton
                        typeId={t.id}
                        missing={t.missingDays}
                        name={t.name}
                      />
                    )}
                    <ShiftTypeDialog
                      type={t}
                      teams={
                        view.teams.some((x) => x.key === t.team)
                          ? view.teams
                          : [{ key: t.team, label: t.teamLabel }, ...view.teams]
                      }
                    />
                    {!t.hasPeople && (
                      <RemoveShiftButton
                        id={t.id}
                        version={t.version}
                        name={t.name}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Fairness({ view }: { view: ShiftsView }) {
  if (!view.fairness) return null;
  const below = view.fairness.filter((r) => r.below);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Who has how many</h2>
          <p className="text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground tabular-nums">
            Open places:{" "}
            {view.days.map((d) => `${d.label}: ${d.openPlaces}`).join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
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

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp"
        title="Shifts"
        description="Who cooks, cleans and keeps watch in burn week."
        actions={
          <>
            {view.canAsk && <AskShifts />}
            <Button asChild variant="outline">
              <Link href={MY_SHIFTS_PATH}>
                <ClipboardList aria-hidden />
                My shifts
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`${SHIFTS_PRINT_PATH}${day ? `?day=${day.day}` : ""}`}
              >
                <Printer aria-hidden />
                Print
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm text-muted-foreground">
          {PAPER_NOTE}
        </p>
        {view.reminder && (
          <p
            role="status"
            data-testid="shift-reminder"
            className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            {asked ? "The captains asked everyone who is coming. " : ""}
            {view.reminder}
          </p>
        )}
        {view.teams.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {SHIFTS_REFUSAL}
          </p>
        )}

        {view.burnDays.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm text-muted-foreground">
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
          <>
            <DayPicker days={view.days} current={day.day} />
            <DayCard day={day} members={view.members} />
          </>
        )}

        <ShiftTypes view={view} />
        <Fairness view={view} />
      </div>
    </div>
  );
}
