import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { campDayKey } from "@camp404/core";
import { getTeamsConfig } from "../../camp-config";
import {
  addDays,
  calendarHref,
  filterEntries,
  shortDayLabel,
  WHOLE_CAMP,
  type CalendarEntry,
} from "../../calendar-month";
import { readCalendarDays } from "../../calendar-page";
import { daysBetween, relativeDay } from "../../home";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The camp calendar over MCP, as the Calendar reads it: the camp's shared
// Google Calendar, the events and meetings made in the Calendar, and each
// meeting's minutes in brief (readCalendarDays, the page's own read), for any
// days, the past included, filtered as the page filters (team, type). Every
// approved member reads it, as on the page. Private events never come back
// from Google. Adding, changing and removing an event stays on the website:
// it goes on the camp's shared Google Calendar for everyone.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The most days one call may read. */
const MAX_DAYS = 400;

/** The page's words for a calendar it cannot read. */
const CALENDAR_NOTE = {
  not_configured:
    "The camp's Google Calendar isn't connected yet, so only the events made in the app are listed.",
  unavailable:
    "Couldn't reach the camp's Google Calendar just now, so only the events made in the app are listed.",
} as const;

function present(entry: CalendarEntry, memberTeams: readonly string[]) {
  return {
    id: entry.id,
    title: entry.title,
    type: entry.kind,
    team: entry.team
      ? { ...entry.team, mine: memberTeams.includes(entry.team.key) }
      : null,
    allDay: entry.allDay,
    startDay: entry.startDay,
    endDay: entry.endDay,
    startTime: entry.startTime,
    endTime: entry.endTime,
    place: entry.place,
    description: entry.description,
    madeIn:
      entry.source === "app"
        ? "the Calendar"
        : entry.source === "logistics"
          ? "Logistics"
          : entry.source === "deadline"
            ? "the camp's year page (AfrikaBurn dates)"
            : "Google Calendar",
    minutes: entry.meeting
      ? {
          meetingId: entry.meeting.noteId,
          written: entry.meeting.minutes,
          decisions: entry.meeting.decisions,
          actionItems: entry.meeting.actionItems,
          openActionItems: entry.meeting.openActionItems,
          firstDecision: entry.meeting.firstDecision,
        }
      : null,
    url: siteUrl(
      calendarHref({
        view: "month",
        month: entry.startDay.slice(0, 7),
        when: "upcoming",
        team: null,
        type: "all",
        event: entry.id,
        newOn: null,
      }),
    ),
  };
}

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "list_calendar_events",
    {
      title: "List the camp calendar",
      description:
        'Events and meetings on the camp calendar, by camp day, as the Calendar shows them. By default today to a year ahead; `from` and `to` (YYYY-MM-DD, camp days, the past included, at most 400 days) choose the days. `team` is a team key for that team\'s events, or "camp" for whole-camp events only; `type` is "meetings" or "events". Each event says its type, whose team it is (and whether you are on it), where it was made, and for a meeting how its minutes stand (`minutes.meetingId` is what get_meeting takes).',
      inputSchema: z.object({
        from: z.string().regex(DAY).optional(),
        to: z.string().regex(DAY).optional(),
        team: z.string().max(60).optional(),
        type: z.enum(["meetings", "events"]).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_calendar_events",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const today = campDayKey(new Date());
          const from = args.from ?? today;
          const to = args.to ?? addDays(from, 365);
          if (to < from) throw new ToolError("`to` is before `from`.");
          if (daysBetween(from, to) > MAX_DAYS) {
            throw new ToolError(
              `Ask for at most ${MAX_DAYS} days at a time.`,
            );
          }
          const config = await getTeamsConfig();
          const teams = config.teams.map((t) => ({
            key: t.key,
            label: t.label,
          }));
          const knownTeam =
            args.team === WHOLE_CAMP ||
            teams.some((t) => t.key === args.team);
          const filter = {
            team: args.team && knownTeam ? args.team : null,
            type: args.type ?? ("all" as const),
          };
          const read = await readCalendarDays({ from, to }, teams);
          const entries = filterEntries(read.entries, filter);

          // Each event under each of its days in the range.
          const byDay = new Map<string, CalendarEntry[]>();
          for (const entry of entries) {
            const first = entry.startDay < from ? from : entry.startDay;
            const last = entry.endDay > to ? to : entry.endDay;
            for (let day = first; day <= last; day = addDays(day, 1)) {
              byDay.set(day, [...(byDay.get(day) ?? []), entry]);
            }
          }
          const url = siteUrl(
            calendarHref({
              view: "month",
              month: from.slice(0, 7),
              when: "upcoming",
              team: filter.team,
              type: filter.type,
              event: null,
              newOn: null,
            }),
          );
          return {
            status: read.status,
            ...(read.status !== "ok"
              ? { note: CALENDAR_NOTE[read.status] }
              : args.team && !knownTeam
                ? { note: "No team has that key, so this is every event." }
                : {}),
            days: [...byDay.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, list]) => ({
                day,
                date: shortDayLabel(day),
                relative: relativeDay(daysBetween(today, day)),
                events: list.map((e) => present(e, scope.memberTeams)),
              })),
            url,
          };
        },
      }),
  );
}
