import { canWorkInTeam } from "@camp404/core";
import { findMeeting } from "../mcp/tools/meetings-more";
import { readNames, readTeamLabels } from "./reads";
import {
  blocked,
  dayLabel,
  listed,
  quote,
  shown,
  str,
  type PreviewFn,
} from "./preview-kit";

// Voice's row for save_meeting_minutes: the meeting as the minutes editor
// reads it on the server (its title and day, never Claude's words), what each
// part given will hold after Do, and the version it was read at (null before
// the first minutes).

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export const MEETINGS_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async save_meeting_minutes(args, ctx) {
    const eventId = str(args.eventId);
    const found = await findMeeting(eventId);
    const path = `/calendar/${eventId}/minutes`;
    if (!found) {
      return blocked(
        "Save a meeting's minutes",
        "That meeting isn't on the calendar.",
        args,
        "/calendar",
      );
    }
    const { entry, note, hasMinutes, team } = found;
    const labels = await readTeamLabels();
    const teamLabel = (key: string | null) =>
      key ? (labels[key] ?? key) : "Whole camp";

    const items = Array.isArray(args.actionItems)
      ? (args.actionItems as Record<string, unknown>[])
      : null;
    const names = await readNames([
      ...ids(args.attendeeIds),
      ...(items ?? []).map((i) => str(i.assigneeId)),
    ]);
    const nameOf = (id: string) => names.get(id) ?? "someone not on the roster";

    const change: string[] = [];
    if (args.agenda !== undefined) change.push(`Agenda: ${shown(args.agenda)}`);
    if (args.notes !== undefined) change.push(`Notes: ${shown(args.notes)}`);
    if (args.attendeeIds !== undefined) {
      change.push(
        `Who was there (the whole list): ${listed(ids(args.attendeeIds).map(nameOf))}`,
      );
    }
    if (Array.isArray(args.decisions)) {
      change.push(
        `Decisions (the whole list): ${listed(args.decisions.map((d) => shown(d)))}`,
      );
    }
    let newItems = 0;
    if (items) {
      const known = new Set((note?.actionItems ?? []).map((i) => i.id));
      newItems = items.filter((i) => !i.id || !known.has(str(i.id))).length;
      change.push(
        `Action items (the whole list): ${listed(
          items.map((i) => {
            const itemTeam =
              i.team !== undefined ? (i.team as string | null) : team;
            const bits = [
              i.assigneeId ? nameOf(str(i.assigneeId)) : "nobody yet",
              teamLabel(itemTeam),
              i.due ? `due ${dayLabel(str(i.due))}` : "no deadline",
            ];
            return `${shown(i.text)} (${bits.join(", ")})`;
          }),
        )}`,
      );
    }

    const first = note === null;
    const base = {
      sentence: `${first ? "Write the first minutes of" : "Change the minutes of"} ${quote(entry.title)}`,
      facts: [
        "Calendar",
        teamLabel(team),
        dayLabel(entry.startDay),
        first ? "no minutes yet" : "as you read it",
        ...(newItems > 0
          ? [
              `${newItems} new action item${newItems === 1 ? "" : "s"} go on the task board`,
            ]
          : []),
      ].join(" · "),
      change,
      path,
      args: {
        ...args,
        eventId: entry.id,
        expectedVersion: note?.version ?? null,
      },
      keys: note ? [`meeting:${note.id}`] : [`meeting-event:${entry.id}`],
    };
    if (!hasMinutes) return { ...base, blocked: "Only a meeting has minutes." };
    if (!canWorkInTeam(ctx.scope.viewerRank, ctx.scope.memberTeams, team)) {
      return {
        ...base,
        blocked:
          team === null
            ? "Only a captain writes a whole-camp meeting's minutes."
            : `Only ${teamLabel(team)}'s members this year and captains write its minutes.`,
      };
    }
    if (change.length === 0) {
      return { ...base, blocked: "Nothing to change was given." };
    }
    return base;
  },
};
