import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Crown,
  Megaphone,
  NotebookPen,
  Plus,
  SquareKanban,
  User,
  Users,
} from "lucide-react";
import {
  canApproveClaim,
  canEditTeamProgram,
  canManageCampEvent,
  canManageMoney,
  errorLogText,
} from "@camp404/core";
import { Team } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import { CalendarRow } from "@/components/calendar/calendar-days";
import { MeetingRow } from "@/components/meetings/meeting-row";
import { TeamAboutCard } from "@/components/teams/team-about-card";
import { TeamAboutEditor } from "@/components/teams/team-about-editor";
import { TeamAnnouncementsCard } from "@/components/teams/team-announcements-card";
import { TeamBudgetCard } from "@/components/teams/team-budget-card";
import { TEAM_PANELS } from "@/components/teams/team-panels";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { listBudgetTotals } from "@/lib/claims";
import { buildCalendarDays } from "@/lib/calendar-view";
import { CALENDAR_PAGE_RANGE } from "@/lib/google-calendar";
import { listMeetingNotes } from "@/lib/meeting-notes";
import {
  meetingsHref,
  newMeetingHref,
  TEAM_MEETING_LIMIT,
} from "@/lib/meeting-notes-view";
import { ledgerCycle } from "@/lib/payments";
import { listTeamPeople, type TeamPerson } from "@/lib/roster";
import { presentTask, TASK_COLUMN_LABEL, tasksHref } from "@/lib/task-board";
import { buildTeamPage, writeAnnouncementHref } from "@/lib/team-page";
import { listBoardTasks } from "@/lib/tasks";
import { getTeamProgram, listTeamAnnouncements } from "@/lib/team-programs";
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

// A team's own program (TEAM.EXE; docs/specs/2026-09-27-team-programs.md).
// Every approved member opens every team's program, read-only (owner's
// decision 2, 2026-09-26). It holds the team's own description (ruling 4; no
// links: everything happens inside the app), the team's own panels from
// TEAM_PANELS (Power and Lighting's power plan at a glance, ruling 2), the
// announcements the team has sent (ruling 3), then the common frame of #267:
// its upcoming events, its open tasks, its meeting notes (#268) and this
// year's leads and members.
//
// Who may change things (ruling 1): a captain or a lead of THIS team, by
// canEditTeamProgram; only they get the Edit control, and the action checks
// again. "New meeting" opens the Calendar's New event form, for those who put
// the team's meetings on the calendar (canManageCampEvent: captains and the
// team's leads); its members write the minutes there. The team's budget (#242) follows
// its own panels: every member reads the totals (budget, spent, left), never
// a claim.
// The composition is Home's: the main cards on the left, the people beside.

const DUE_VARIANT = {
  overdue: "destructive",
  soon: "warning",
  later: "outline",
  done: "outline",
} as const;

/** A card's header with its one action at the right. */
const HEADER_WITH_ACTION =
  "flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0 pb-3";
/** A card's "See all" link, at its foot. */
const FOOT_LINK =
  "mt-3 self-start text-xs font-medium text-accent hover:underline";

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
        <span className="block text-sm font-medium [overflow-wrap:anywhere]">
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
  const [
    people,
    calendar,
    tasks,
    leadTeams,
    meetings,
    about,
    announcements,
    budgets,
  ] = await Promise.all([
    listTeamPeople(team.data),
    getUpcomingEvents(CALENDAR_PAGE_RANGE),
    listBoardTasks(now),
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
    listMeetingNotes({ team: team.data, limit: TEAM_MEETING_LIMIT }),
    getTeamProgram(team.data),
    listTeamAnnouncements(team.data),
    ledgerCycle().then(listBudgetTotals),
  ]);
  const canEdit = canEditTeamProgram(rank, leadTeams, team.data);
  // The team's own panels read their own data; drawn here, before the page,
  // so the whole program arrives in one server render. A panel that fails
  // leaves the shared cards standing: it is logged and left out.
  const teamPanel = TEAM_PANELS[team.data];
  const panel = teamPanel
    ? await teamPanel({ rank, leadTeams }).catch((error: unknown) => {
        console.error(
          `[team-panel:${team.data}]`,
          errorLogText(error, process.env),
        );
        return null;
      })
    : null;
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
  // Captains and the team's leads put its meetings on the calendar; its
  // members write their minutes there.
  const canAddMeeting =
    !entry.archived && canManageCampEvent(rank, leadTeams, key);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Teams"
        title={entry.label}
        description="What the team does, what it has sent, what's coming up, and who is on it this year."
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

      {/* The main cards by use, the people beside them from a medium window
          up (the window opens wide enough for both). Each card's own action
          sits at the right of its header, the "See all" link at its foot. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 page-md:grid-cols-[minmax(0,1fr)_17rem] page-lg:grid-cols-3">
        <div className="flex flex-col gap-6 page-lg:col-span-2">
          <TeamAboutCard
            description={about.description}
            editor={
              canEdit ? (
                <TeamAboutEditor
                  key={about.version}
                  team={team.data}
                  teamLabel={entry.label}
                  description={about.description}
                  version={about.version}
                />
              ) : undefined
            }
          />

          {panel}

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
                <Link href={calendarHref} className={FOOT_LINK}>
                  {page.eventsMore > 0
                    ? `See all on the calendar (+${page.eventsMore} more)`
                    : "See this team on the calendar"}
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={HEADER_WITH_ACTION}>
              <CardTitle className="flex items-center gap-2 text-base">
                <SquareKanban className="h-4 w-4 text-accent" aria-hidden />
                Open tasks
              </CardTitle>
              {canEdit && !entry.archived ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={tasksHref(key, { add: true })}>
                    <Plus aria-hidden />
                    Add task
                  </Link>
                </Button>
              ) : null}
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
                      className="grid grid-cols-[0.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 page-sm:grid-cols-[0.5rem_minmax(0,1fr)_7.5rem]"
                    >
                      {/* Where the card stands on the board, as a dot: content
                          to read, not a box to tick. */}
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          task.status === "in_progress"
                            ? "bg-accent"
                            : "bg-muted-foreground/60",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                          {task.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            TASK_COLUMN_LABEL[task.status],
                            task.assigneeName
                              ? `${task.assigneeName}${task.mine ? " (you)" : ""}`
                              : "Nobody yet",
                          ].join(" · ")}
                        </span>
                      </span>
                      {/* One column of one width, so the deadlines line up;
                          on a phone it drops under the title. */}
                      <span className="col-start-2 flex page-sm:col-start-3 page-sm:row-start-1 page-sm:justify-end">
                        {task.due ? (
                          <Badge variant={DUE_VARIANT[task.due.tone]}>
                            {task.due.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No deadline
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={tasksHref(key)} className={FOOT_LINK}>
                See all of this team&rsquo;s tasks
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={HEADER_WITH_ACTION}>
              <CardTitle className="flex items-center gap-2 text-base">
                <NotebookPen className="h-4 w-4 text-accent" aria-hidden />
                Meetings
              </CardTitle>
              {canAddMeeting ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={newMeetingHref(key)}>
                    <Plus aria-hidden />
                    New meeting
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {meetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No meetings written up for this team yet.
                </p>
              ) : (
                <ul
                  aria-label="Team meetings"
                  className="-my-3 divide-y divide-border"
                >
                  {meetings.map((note) => (
                    <li key={note.id}>
                      <MeetingRow note={note} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={meetingsHref(key)} className={FOOT_LINK}>
                See all meetings
              </Link>
            </CardContent>
          </Card>

          <TeamAnnouncementsCard
            items={announcements.items}
            more={announcements.more}
            action={
              canEdit && !entry.archived ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={writeAnnouncementHref(key)}>
                    <Megaphone aria-hidden />
                    Write announcement
                  </Link>
                </Button>
              ) : undefined
            }
          />

          <TeamBudgetCard
            team={team.data}
            teamLabel={entry.label}
            totals={budgets[team.data]}
            onTeam={page.viewer.onTeam && !entry.archived}
            canApprove={canApproveClaim(rank, leadTeams, team.data)}
            keepsMoney={canManageMoney(rank, leadTeams)}
          />
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
              className={FOOT_LINK}
            >
              See them on the roster
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
