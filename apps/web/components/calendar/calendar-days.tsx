import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import type { CalendarDay, CalendarItem } from "@/lib/calendar-view";

// The camp calendar's events, drawn the way Home's "Coming up" draws them: a
// time column in the accent, the title with its place beneath, and the team's
// badge, which opens that team's page. On a phone the badge drops under the
// title, so a long team name never squeezes the title off the screen.

/** The href of a team's page. */
export function teamHref(key: string): string {
  return `/teams/${encodeURIComponent(key)}`;
}

/** A team's badge: "Yours · Kitchen" when the viewer is on it, else "Kitchen". */
function TeamBadge({ team }: { team: NonNullable<CalendarItem["team"]> }) {
  return (
    <Link
      href={teamHref(team.key)}
      className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {team.mine ? (
        <Badge className="hover:bg-primary/80">Yours · {team.label}</Badge>
      ) : (
        <Badge variant="outline" className="hover:border-accent/60">
          {team.label}
        </Badge>
      )}
    </Link>
  );
}

/** One event as a row: when, what and where, and whose. */
export function CalendarRow({
  item,
  when,
  detail,
  showTeam = true,
}: {
  item: CalendarItem;
  /** What the left column says: the time, or the day. */
  when: string;
  /** Said before the place under the title, such as the time. */
  detail?: string;
  showTeam?: boolean;
}) {
  const meta = [detail, item.location].filter(Boolean).join(" · ");
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">
        {when}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {meta ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {item.location ? (
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            ) : null}
            <span className="truncate">{meta}</span>
          </span>
        ) : null}
      </span>
      {showTeam && item.team ? (
        <span className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end">
          <TeamBadge team={item.team} />
        </span>
      ) : null}
    </div>
  );
}

/** The Calendar page: a card per camp day, soonest first. */
export function CalendarDayCards({ days }: { days: CalendarDay[] }) {
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <Card key={day.key}>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-baseline justify-between gap-3 text-base">
              <span id={`day-${day.key}`}>{day.date}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {day.relative}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              aria-labelledby={`day-${day.key}`}
              className="divide-y divide-border"
            >
              {day.items.map((item) => (
                <li key={item.id}>
                  <CalendarRow item={item} when={item.time} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
