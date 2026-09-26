import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Car,
  CheckCircle2,
  Circle,
  ClipboardList,
  Crown,
  FileText,
  Hourglass,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Send,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import type { HomeModel, HomeModuleIcon } from "@/lib/home";
import { MINE_ROW, MineStar } from "@/components/calendar/calendar-days";
import { TEAM_ICONS } from "@/lib/nav-icons";

// A member's own home: what to do, what's coming, and the few places that are
// theirs. Built for someone easily overwhelmed (owner, 2026-09-23): short
// lines, no paragraphs, and a card only when it applies to this person
// (lib/home.ts decides which). Drawn in the console kit — cards, rows, badges.

function Row({
  href,
  children,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const body = (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      {children}
    </div>
  );
  return href ? (
    <Link href={href} className="group block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ToDoCard({ todos }: { todos: HomeModel["todos"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="h-4 w-4 text-accent" aria-hidden />
          To do
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            You&rsquo;re all caught up.
          </p>
        ) : (
          <ul aria-label="To do" className="-my-3 divide-y divide-border">
            {todos.map((todo) => (
              <li key={todo.id}>
                <Row href={todo.href}>
                  <Circle
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {todo.label}
                  </span>
                  {todo.due ? (
                    <Badge variant={todo.urgent ? "warning" : "outline"}>
                      {todo.due}
                    </Badge>
                  ) : null}
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Row>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The tasks on the board that are this member's, drawn as the To do card is.
 * Shown only when they have one; the full board is a link away.
 */
function YourTasksCard({
  tasks,
  more,
}: {
  tasks: HomeModel["tasks"];
  more: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SquareKanban className="h-4 w-4 text-accent" aria-hidden />
          Your tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul aria-label="Your tasks" className="-my-3 divide-y divide-border">
          {tasks.map((task) => (
            <li key={task.id}>
              <Row href={task.href}>
                <Circle
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {task.label}
                </span>
                {task.doing ? <Badge variant="outline">Doing</Badge> : null}
                {task.due ? (
                  <Badge variant={task.urgent ? "warning" : "outline"}>
                    {task.due}
                  </Badge>
                ) : null}
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Row>
            </li>
          ))}
        </ul>
        <Link
          href="/tasks"
          className="mt-3 self-start text-xs font-medium text-accent hover:underline"
        >
          {more > 0 ? `See all tasks (+${more} more)` : "See all tasks"}
        </Link>
      </CardContent>
    </Card>
  );
}

const CALENDAR_NOTE: Record<string, string> = {
  not_configured: "The camp calendar isn't connected yet.",
  unavailable: "Couldn't reach the camp calendar just now.",
};

function ComingUpCard({
  upcoming,
  calendarState,
}: {
  upcoming: HomeModel["upcoming"];
  calendarState: HomeModel["calendarState"];
}) {
  const note = calendarState ? CALENDAR_NOTE[calendarState] : undefined;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
          Coming up
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {note ?? "Nothing on the calendar yet."}
          </p>
        ) : (
          <ul aria-label="Coming up" className="-my-3 divide-y divide-border">
            {upcoming.map((item) => (
              <li key={item.id}>
                {/* On a phone the badge drops under the title, so a long team
                    name never pushes the card wider than the screen. */}
                <div
                  data-mine={item.team?.mine ? "" : undefined}
                  className={cn(
                    "grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto]",
                    item.team?.mine && MINE_ROW,
                  )}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {item.relative}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {item.team?.mine ? <MineStar /> : null}
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.location
                        ? `${item.when} · ${item.location}`
                        : item.when}
                    </span>
                  </span>
                  {/* A team's event wears the team's badge; one of your
                      teams' events also gets the border and star. A camp-wide
                      event wears no badge. */}
                  {item.team ? (
                    <span className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end">
                      <Badge variant="outline">{item.team.label}</Badge>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > 0 && note ? (
          <p className="text-xs text-muted-foreground">{note}</p>
        ) : null}
        <Link
          href="/calendar"
          className="mt-3 self-start text-xs font-medium text-accent hover:underline"
        >
          See the calendar
        </Link>
      </CardContent>
    </Card>
  );
}

function WaitingCard() {
  return (
    <Card className="border-accent/40">
      <CardContent className="flex items-start gap-3 p-5">
        <Hourglass
          className="mt-0.5 h-5 w-5 shrink-0 text-accent"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Waiting for a captain</p>
          <p className="text-sm text-muted-foreground">
            Your bio is in. You&rsquo;ll get a notice here when you&rsquo;re
            approved. Nothing else to do for now.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistCard({
  checklist,
  allDone,
}: {
  checklist: HomeModel["checklist"];
  allDone: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          Your setup
          {allDone ? <Badge variant="success">All set</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul aria-label="Your setup" className="flex flex-col gap-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
              <span className={item.done ? "" : "text-muted-foreground"}>
                {item.label}
              </span>
              <span className="sr-only">{item.done ? "done" : "not yet"}</span>
            </li>
          ))}
        </ul>
        {checklist.some((c) => c.label === "Sign-in secured" && !c.done) ? (
          <Link
            href="/profile/security"
            className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
          >
            Add two-factor or a passkey
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LiftCard({ lift }: { lift: NonNullable<HomeModel["lift"]> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-4 w-4 text-accent" aria-hidden />
          {lift.heading}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          {lift.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Where a long tile name may break on a phone-width tile. A soft hyphen shows
 * a "-" only if the word actually breaks, and screen readers ignore it.
 */
function breakable(label: string): string {
  return label.replace("Notifications", "Notifi\u00ADcations");
}

const MODULE_ICONS: Record<HomeModuleIcon, LucideIcon> = {
  announcements: Megaphone,
  forms: FileText,
  message: Send,
  "send-form": ClipboardList,
  overview: LayoutDashboard,
  tasks: SquareKanban,
  "add-event": CalendarPlus,
};

/** A small count in the corner of a tile or icon. */
function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * The member's modules as square tiles (owner, 2026-09-23: "a more square grid
 * of icons with indicators … not like a settings menu"). Each tile is one place
 * to go, with a count when something there is new.
 */
function ModuleGrid({ modules }: { modules: HomeModel["modules"] }) {
  return (
    <nav aria-label="Your modules">
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        {modules.map((m) => {
          const Icon = MODULE_ICONS[m.icon];
          return (
            <li key={m.id}>
              <Link
                href={m.href}
                aria-label={
                  m.badge
                    ? `${m.label}, ${m.badge} ${m.badgeSays ?? "new"}`
                    : m.label
                }
                className="group relative flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-1 py-3 text-center transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-square sm:py-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="line-clamp-2 w-full hyphens-manual text-[11px] font-medium leading-tight sm:text-xs">
                  {breakable(m.label)}
                </span>
                {m.badge ? (
                  <CountBadge
                    count={m.badge}
                    className="absolute right-1.5 top-1.5"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The member's teams as icons. Several teams, several icons, and a team they
 * lead wears an accent ring with a crown set into it — the crown's background
 * cuts the ring, so it reads as a badge on the icon, not a second icon. A count
 * sits on any team with unread announcements.
 */
function TeamIcons({ teams }: { teams: HomeModel["teams"] }) {
  return (
    <section aria-labelledby="my-teams" className="flex flex-col gap-3">
      <h2
        id="my-teams"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {teams.length === 1 ? "My team" : "My teams"}
      </h2>
      <ul className="flex flex-wrap gap-4">
        {teams.map((team) => {
          const Icon = TEAM_ICONS[team.key] ?? Users;
          const said = [
            team.label,
            team.isLead ? "you lead this team" : null,
            team.unread ? `${team.unread} new` : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={team.key}>
              <Link
                href={team.href}
                aria-label={said}
                className="group flex w-20 flex-col items-center gap-1.5 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "relative flex h-14 w-14 items-center justify-center rounded-full bg-card text-foreground transition-colors group-hover:text-accent group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    team.isLead
                      ? "border-2 border-accent"
                      : "border border-border",
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                  {team.isLead ? (
                    <span
                      aria-hidden
                      className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background text-accent"
                    >
                      <Crown className="h-4 w-4" />
                    </span>
                  ) : null}
                  {team.unread ? (
                    <CountBadge
                      count={team.unread}
                      className="absolute -bottom-1 -right-1"
                    />
                  ) : null}
                </span>
                <span className="line-clamp-2 w-full hyphens-auto break-words text-center text-xs leading-tight text-muted-foreground group-hover:text-foreground">
                  {team.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeView({ home }: { home: HomeModel }) {
  return (
    <div className="flex flex-col">
      <PageHeading eyebrow="Home" title={home.greeting} />
      <div className="-mt-3 mb-6 flex flex-wrap gap-2" aria-label="You are">
        {home.chips.map((chip) => (
          <Badge key={chip} variant="outline">
            {chip}
          </Badge>
        ))}
      </div>

      {/* One column on a phone that never grows past the screen: an auto
          column would take the width of the longest task title. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ModuleGrid modules={home.modules} />
          {home.waitingForApproval ? (
            <WaitingCard />
          ) : (
            <>
              <ToDoCard todos={home.todos} />
              {home.tasks.length > 0 ? (
                <YourTasksCard tasks={home.tasks} more={home.tasksMore} />
              ) : null}
              <ComingUpCard
                upcoming={home.upcoming}
                calendarState={home.calendarState}
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-6">
          {home.teams.length > 0 ? <TeamIcons teams={home.teams} /> : null}
          {home.lift ? <LiftCard lift={home.lift} /> : null}
          <ChecklistCard checklist={home.checklist} allDone={home.allDone} />
        </div>
      </div>
    </div>
  );
}
