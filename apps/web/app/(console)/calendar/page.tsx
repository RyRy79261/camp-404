import { Suspense } from "react";
import {
  campDayKey,
  canCreateCampEvents,
  canManageCampEvent,
  canWorkInTeam,
} from "@camp404/core";
import { Team } from "@camp404/types";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { CalendarBoard } from "@/components/calendar/calendar-board";
import { NewEventButton } from "@/components/calendar/new-event-button";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import {
  filterEntries,
  parseCalendarState,
  urlNamesMonth,
  type CalendarState,
} from "@/lib/calendar-month";
import {
  findCalendarEntry,
  readCalendarDays,
  stateRange,
} from "@/lib/calendar-page";
import { getLeadTeams, getMyTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calendar — Camp 404" };

// The Calendar (owner, 2026-10-10: "Meetings is a type of calendar item, it
// shouldn't be a separate app, you make events in the calendar app"). One
// program: a month (Monday first) or a list (Coming up, Past), filtered by
// team and by type, the open event beside it. Every view is a link: the URL
// carries the view, the month, the list's half, the filters and the open
// event (lib/calendar-month.ts), and every change replaces it.
//
// Every approved member reads it. Captains and team leads add events and
// meetings (a lead for a team they lead, whole camp is captains'), checked
// again inside each write. A meeting's agenda and minutes are written by its
// team's members this year and captains (canWorkInTeam).

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // The gate first, before any boundary: a redirect or a refusal is decided
  // here, on the server, with the page's own status.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canCreate = canCreateCampEvents(rank, leadTeams);

  return (
    <div className="flex min-h-0 flex-col" data-fills-window>
      <PageHeading
        eyebrow="Camp / Calendar"
        title="Calendar"
        description="Everything on the camp's calendar. Click an event to see it; a meeting keeps its agenda and minutes."
        actions={canCreate ? <NewEventButton /> : null}
      />
      {/* The Google read can take seconds (up to its 5 s timeout, cached 5
          minutes per server): the heading shows first, and the calendar
          streams in behind a skeleton. Nothing below decides access. */}
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarBody
          userId={campUser.id}
          rank={rank}
          leadTeams={leadTeams}
          canCreate={canCreate}
          searchParams={searchParams}
        />
      </Suspense>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <SkeletonRegion
      label="Loading the calendar…"
      className="flex flex-col gap-3"
    >
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-[28rem] w-full" />
    </SkeletonRegion>
  );
}

async function CalendarBody({
  userId,
  rank,
  leadTeams,
  canCreate,
  searchParams,
}: {
  userId: string;
  rank: Awaited<ReturnType<typeof captainPageGate>>["rank"];
  leadTeams: string[];
  canCreate: boolean;
  searchParams: SearchParams;
}) {
  const [config, memberships, raw] = await Promise.all([
    getTeamsConfig(),
    getMyTeams(userId),
    searchParams,
  ]);
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const today = campDayKey(new Date());
  let state: CalendarState = parseCalendarState(raw, today, teams);

  // A link to an event with no month opens on the event's month.
  const found = state.event ? await findCalendarEntry(state.event, teams) : null;
  if (found && state.view === "month" && !urlNamesMonth(raw)) {
    state = { ...state, month: found.entry.startDay.slice(0, 7) };
  }

  const days = await readCalendarDays(stateRange(state, today), teams);
  const entries = filterEntries(days.entries, state);

  const memberTeams = memberships.map((m) => m.team);
  const selected = found
    ? {
        entry: found.entry,
        note: found.note,
        canEditEvent:
          found.entry.source === "app" &&
          canManageCampEvent(rank, leadTeams, found.entry.team?.key ?? null),
        canWriteMinutes:
          (found.entry.kind === "meeting" ||
            found.entry.source === "google") &&
          canWorkInTeam(rank, memberTeams, found.entry.team?.key ?? null),
        canMakeTasks:
          rank === "captain" ||
          (found.entry.team !== null &&
            leadTeams.includes(found.entry.team.key)),
      }
    : null;

  // The filter offers the active teams, plus an archived one a link arrived
  // on, so the select never shows a value it does not list.
  const teamOptions = activeTeams(config).map((t) => ({
    value: t.key,
    label: t.label,
  }));
  const chosen = teams.find((t) => t.key === state.team);
  if (chosen && !teamOptions.some((o) => o.value === chosen.key)) {
    teamOptions.push({ value: chosen.key, label: chosen.label });
  }

  // The teams the New event form offers: every active team for a captain
  // (and the whole camp), the teams a lead leads.
  const formTeams = canCreate
    ? activeTeams(config)
        .filter((t) => Team.safeParse(t.key).success)
        .filter((t) => canManageCampEvent(rank, leadTeams, t.key))
        .map((t) => ({ value: t.key, label: t.label }))
    : [];

  return (
    <CalendarBoard
      state={state}
      today={today}
      entries={entries}
      readStatus={days.status}
      eventMissing={state.event !== null && found === null}
      selected={selected}
      teamOptions={teamOptions}
      form={
        canCreate
          ? { teams: formTeams, canPickWholeCamp: rank === "captain" }
          : null
      }
    />
  );
}
