import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUpcomingEvents } from "../../camp-calendar";
import { getTeamsConfig } from "../../camp-config";
import {
  buildCalendarDays,
  parseCalendarFilter,
  WHOLE_CAMP_FILTER,
} from "../../calendar-view";
import { CALENDAR_PAGE_RANGE } from "../../google-calendar";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The camp calendar over MCP, as the Calendar page reads it: the camp's shared
// Google Calendar for the year ahead (CALENDAR_PAGE_RANGE, from today), grouped
// by camp day with the page's own function (buildCalendarDays), and its team
// filter (parseCalendarFilter). Every approved member reads it, as on the page.
// The calendar holds only what is on the camp's calendar; private events never
// come back from Google. Adding an event stays on the page.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The page's words for a calendar it cannot read. */
const CALENDAR_NOTE = {
  not_configured:
    "The camp calendar isn't connected yet. A captain can connect it under System status.",
  unavailable: "Couldn't reach the camp calendar just now. Try again shortly.",
} as const;

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "list_calendar_events",
    {
      title: "List the camp calendar",
      description:
        "Events on the camp's shared calendar, by camp day, as the Calendar page shows them. It covers today to a year ahead (an event already under way is listed under today). `from` and `to` (YYYY-MM-DD, camp days) narrow it; `team` is a team key for that team's events, or \"camp\" for whole-camp events only. Each event says whose team it is and whether you are on that team.",
      inputSchema: {
        from: z.string().regex(DAY).optional(),
        to: z.string().regex(DAY).optional(),
        team: z.string().max(60).optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_calendar_events",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          if (args.from && args.to && args.to < args.from) {
            throw new ToolError("`to` is before `from`.");
          }
          const [calendar, config] = await Promise.all([
            getUpcomingEvents(CALENDAR_PAGE_RANGE),
            getTeamsConfig(),
          ]);
          const url = siteUrl(
            args.team
              ? `/calendar?team=${encodeURIComponent(args.team)}`
              : "/calendar",
          );
          if (calendar.status !== "ok") {
            return {
              status: calendar.status,
              note: CALENDAR_NOTE[calendar.status],
              days: [],
              url,
            };
          }
          const teams = config.teams.map((t) => ({
            key: t.key,
            label: t.label,
          }));
          const days = buildCalendarDays({
            events: calendar.events,
            now: new Date(),
            teams,
            myTeams: new Set(scope.memberTeams),
            filter: parseCalendarFilter(args.team, teams),
          }).filter(
            (d) =>
              (!args.from || d.key >= args.from) &&
              (!args.to || d.key <= args.to),
          );
          return {
            status: "ok" as const,
            ...(args.team &&
            args.team !== WHOLE_CAMP_FILTER &&
            !teams.some((t) => t.key === args.team)
              ? { note: "No team has that key, so this is every event." }
              : {}),
            days: days.map((d) => ({
              day: d.key,
              date: d.date,
              relative: d.relative,
              events: d.items,
            })),
            url,
          };
        },
      }),
  );
}
