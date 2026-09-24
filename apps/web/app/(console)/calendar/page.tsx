import Link from "next/link";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  CalendarDayCards,
  teamHref,
} from "@/components/calendar/calendar-days";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  buildCalendarDays,
  parseCalendarFilter,
  WHOLE_CAMP_FILTER,
} from "@/lib/calendar-view";
import { CALENDAR_PAGE_RANGE } from "@/lib/google-calendar";
import { getMyTeams } from "@/lib/users";
import {
  ALL_EVENTS,
  CalendarFilter,
  type CalendarFilterOption,
} from "./calendar-filter";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calendar — Camp 404" };

// The camp calendar (owner, 2026-09-24: "Also a calendar section"): every
// event on the camp's shared Google Calendar for the year ahead, a card per
// day, with a team filter. Every approved member reads it. Adding an event is
// unchanged: captains and team leads, from /captains/calendar, where the rule
// is checked. AfrikaBurn's console has no calendar, so the rows are Home's
// "Coming up" rows and the filter is the task board's.

const CALENDAR_NOTE = {
  not_configured:
    "The camp calendar isn't connected yet. A captain can connect it under System status.",
  unavailable: "Couldn't reach the camp calendar just now. Try again shortly.",
} as const;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const [config, calendar, memberships, { team: requested }] =
    await Promise.all([
      getTeamsConfig(),
      getUpcomingEvents(CALENDAR_PAGE_RANGE),
      getMyTeams(campUser.id),
      searchParams,
    ]);

  // Every team the config names, archived ones too, so an old event and an
  // old link still find their team.
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const filter = parseCalendarFilter(requested, teams);
  const days =
    calendar.status === "ok"
      ? buildCalendarDays({
          events: calendar.events,
          now: new Date(),
          teams,
          myTeams: new Set(memberships.map((m) => m.team)),
          filter,
        })
      : [];

  // The filter offers the active teams, plus an archived one a link arrived
  // on, so the select never shows a value it does not list.
  const options: CalendarFilterOption[] = activeTeams(config).map((t) => ({
    value: t.key,
    label: t.label,
  }));
  const chosen =
    filter.kind === "team"
      ? (teams.find((t) => t.key === filter.key) ?? null)
      : null;
  if (chosen && !options.some((o) => o.value === chosen.key)) {
    options.push({ value: chosen.key, label: chosen.label });
  }
  const value =
    filter.kind === "team"
      ? filter.key
      : filter.kind === "camp"
        ? WHOLE_CAMP_FILTER
        : ALL_EVENTS;

  const empty =
    filter.kind === "team"
      ? `No ${chosen?.label ?? "team"} events coming up.`
      : filter.kind === "camp"
        ? "No whole-camp events coming up."
        : "Nothing on the calendar for the year ahead.";

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Calendar"
        title="Calendar"
        description="Everything on the camp's shared calendar for the year ahead, by day. A team's badge opens that team's page."
        actions={
          // Captains and team leads add events; the page checks the rule.
          rank !== "camp_member" ? (
            <Button asChild>
              <Link href="/captains/calendar">
                <CalendarPlus aria-hidden />
                Add event
              </Link>
            </Button>
          ) : null
        }
      />

      {calendar.status !== "ok" ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {CALENDAR_NOTE[calendar.status]}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CalendarFilter
              value={value}
              teams={options}
              wholeCamp={WHOLE_CAMP_FILTER}
            />
            {chosen ? (
              <Link
                href={teamHref(chosen.key)}
                className="group inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Open the {chosen.label} page
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ) : null}
          </div>

          {days.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {empty}
              </CardContent>
            </Card>
          ) : (
            <CalendarDayCards days={days} />
          )}
        </div>
      )}
    </div>
  );
}
