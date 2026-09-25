import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Circle,
  Crown,
  SquareKanban,
  User,
  Users,
} from "lucide-react";
import { Team } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { CalendarRow } from "@/components/calendar/calendar-days";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { buildCalendarDays } from "@/lib/calendar-view";
import { CALENDAR_PAGE_RANGE } from "@/lib/google-calendar";
import { listTeamPeople, type TeamPerson } from "@/lib/roster";
import { presentTask } from "@/lib/task-board";
import { buildTeamPage } from "@/lib/team-page";
import { listBoardTasks } from "@/lib/tasks";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

/** The tab says which team: "Kitchen — Camp 404". */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const [{ key }, config] = await Promise.all([params, getTeamsConfig()]);
  const label = config.teams.find((t) => t.key === key)?.label;
  return { title: label ? `${label} — Camp 404` : "Team — Camp 404" };
}

// A team's own page (owner, 2026-09-24: "team overviews that show team
// events"): this year's leads and members, the team's upcoming events and its
// open tasks. The first slice of the team dashboards (#267): the common frame
// only, and read-only. Any approved member may open any team's page; it shows
// only what the roster, the calendar and the task board already show them.
// The composition is Home's: the main cards on the left, the people beside.

const DUE_VARIANT = {
  overdue: "destructive",
  soon: "warning",
  later: "outline",
  done: "outline",
} as const;

const CALENDAR_NOTE = {
  not_configured: "The camp calendar isn't connected yet.",
  unavailable: "Couldn't reach the camp calendar just now.",
} as const;

function PersonRow({ person, you }: { person: TeamPerson; you: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        {person.isLead ? (
          <Crown className="h-4 w-4 text-accent" aria-hidden />
        ) : (
          <User className="h-4 w-4" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {person.displayName}
          {you ? <span className="text-muted-foreground"> (you)</span> : null}
        </span>
        {person.handle ? (
          <span className="block truncate text-xs text-muted-foreground">
            @{person.handle}
          </span>
        ) : null}
      </span>
      {person.rank === "captain" ? (
        <Badge variant="outline" className="shrink-0">
          Captain
        </Badge>
      ) : null}
    </li>
  );
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const [{ key }, config] = await Promise.all([params, getTeamsConfig()]);
  // A team the config names (an archived one too: its page still says who was
  // on it this year). Anything else is not a page.
  const entry = config.teams.find((t) => t.key === key);
  const team = Team.safeParse(key);
  if (!entry || !team.success) notFound();

  const now = new Date();
  const [people, calendar, tasks, leadTeams] = await Promise.all([
    listTeamPeople(team.data),
    getUpcomingEvents(CALENDAR_PAGE_RANGE),
    listBoardTasks(now),
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
  ]);
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const teamLabels = Object.fromEntries(teams.map((t) => [t.key, t.label]));
  const page = buildTeamPage({
    viewerId: campUser.id,
    people,
    team: key,
    days:
      calendar.status === "ok"
        ? buildCalendarDays({
            events: calendar.events,
            now,
            teams,
            myTeams: new Set(),
            filter: { kind: "team", key },
          })
        : [],
    cards: tasks.map((task) =>
      presentTask(task, {
        viewer: { id: campUser.id, isCaptain: rank === "captain", leadTeams },
        now,
        teamLabels,
      }),
    ),
  });

  const calendarHref = `/calendar?team=${encodeURIComponent(key)}`;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Teams"
        title={entry.label}
        description="This year's leads and members, the team's upcoming events and its open tasks."
      />
      <div className="-mt-3 mb-6 flex flex-wrap gap-2" aria-label="Team">
        {entry.archived ? <Badge variant="outline">Archived</Badge> : null}
        {page.viewer.leads ? (
          <Badge>You lead this team</Badge>
        ) : page.viewer.onTeam ? (
          <Badge>You&rsquo;re on this team</Badge>
        ) : null}
        {people.length > 0 ? (
          <Badge variant="outline">
            {people.length === 1 ? "1 person" : `${people.length} people`}
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
                Coming up
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {page.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {calendar.status === "ok"
                    ? "Nothing on the calendar for this team yet."
                    : CALENDAR_NOTE[calendar.status]}
                </p>
              ) : (
                <ul
                  aria-label="Team events"
                  className="-my-3 divide-y divide-border"
                >
                  {page.events.map(({ item, day }) => (
                    <li key={item.id}>
                      <CalendarRow
                        item={item}
                        when={day}
                        detail={item.time}
                        showTeam={false}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {calendar.status === "ok" ? (
                <Link
                  href={calendarHref}
                  className="mt-3 self-start text-xs font-medium text-accent hover:underline"
                >
                  {page.eventsMore > 0
                    ? `See all on the calendar (+${page.eventsMore} more)`
                    : "See this team on the calendar"}
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <SquareKanban className="h-4 w-4 text-accent" aria-hidden />
                Open tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {page.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No open tasks for this team.
                </p>
              ) : (
                <ul
                  aria-label="Open tasks"
                  className="-my-3 divide-y divide-border"
                >
                  {page.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
                    >
                      <Circle
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {task.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {task.assigneeName
                            ? `${task.assigneeName}${task.mine ? " (you)" : ""}`
                            : "Nobody yet"}
                        </span>
                      </span>
                      {/* On a phone the badges drop under the title. */}
                      {task.status === "in_progress" || task.due ? (
                        <span className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-3 sm:row-start-1 sm:justify-end">
                          {task.status === "in_progress" ? (
                            <Badge variant="outline">Doing</Badge>
                          ) : null}
                          {task.due ? (
                            <Badge variant={DUE_VARIANT[task.due.tone]}>
                              {task.due.label}
                            </Badge>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/tasks"
                className="mt-3 self-start text-xs font-medium text-accent hover:underline"
              >
                Open the task board
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-accent" aria-hidden />
              People this year
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <section aria-labelledby="team-leads">
              <h2
                id="team-leads"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {page.leads.length === 1 ? "Lead" : "Leads"}
              </h2>
              {page.leads.length === 0 ? (
                <p className="pt-2 text-sm text-muted-foreground">
                  Nobody leads this team yet.
                </p>
              ) : (
                <ul
                  aria-labelledby="team-leads"
                  className="divide-y divide-border"
                >
                  {page.leads.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      you={p.id === campUser.id}
                    />
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="team-members">
              <h2
                id="team-members"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Members
              </h2>
              {page.members.length === 0 ? (
                <p className="pt-2 text-sm text-muted-foreground">
                  {page.leads.length === 0
                    ? "Nobody is on this team yet this year."
                    : "Nobody else yet."}
                </p>
              ) : (
                <ul
                  aria-labelledby="team-members"
                  className="divide-y divide-border"
                >
                  {page.members.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      you={p.id === campUser.id}
                    />
                  ))}
                </ul>
              )}
            </section>
            <Link
              href={`/captains/camp-management?team=${encodeURIComponent(key)}`}
              className="self-start text-xs font-medium text-accent hover:underline"
            >
              See them on the roster
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
