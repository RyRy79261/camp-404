// How a team's event is named on the camp's shared Google Calendar, and how an
// event's title is read back.
//
// THE CONVENTION (owner, 2026-09-24: "Calendar naming convention: 'Power Team
// - General meeting'"). A team's event is titled "<Team label> Team - <title>",
// so people reading Google Calendar or a phone subscribed to it see whose event
// it is: "Power and Lighting Team - General meeting". A label that already
// ends in "Team" is not doubled. A whole-camp event keeps its plain title.
//
// This replaced the "[Team] title" prefix that shipped first (#260). Events
// already on the calendar with that prefix stay as they are in Google (the
// app keeps no copy of them to rewrite), so reading accepts both forms.
//
// In the app a title is shown bare, next to the team's badge, which links to
// the team's page: the badge says whose event it is, so the prefix would say
// it twice.

/** A camp team as the calendar needs it: its stable key and what it is called. */
export interface CalendarTeam {
  key: string;
  label: string;
}

/** The legacy "[Tag] " prefix. */
const TAG_PREFIX = /^\s*\[([^\]]*)\]\s*/;

/** The separator after a team's name: a hyphen, an en dash or an em dash. */
const SEPARATOR = /^\s*[-–—]\s*/;

/**
 * Split a "[Tag] " prefix off an event's title. The tag is trimmed; an empty
 * "[]" is no tag. The title is what is left, trimmed.
 */
export function parseTeamTag(summary: string | null | undefined): {
  tag: string | null;
  title: string;
} {
  const text = summary ?? "";
  const match = TAG_PREFIX.exec(text);
  if (!match) return { tag: null, title: text.trim() };
  const tag = match[1]!.trim();
  if (!tag) return { tag: null, title: text.trim() };
  return { tag, title: text.slice(match[0].length).trim() };
}

/**
 * What a team is called in an event title: its label, then "Team", unless the
 * label already ends with the word "Team" ("A Team" stays "A Team").
 */
export function teamEventName(label: string): string {
  const name = label.trim();
  return /\bteam$/i.test(name) ? name : `${name} Team`;
}

/**
 * The title a team's event carries on the calendar:
 * "Power and Lighting Team - General meeting". Without a team, the title as
 * typed. The one place the convention is written.
 */
export function teamEventTitle(
  teamLabel: string | null,
  title: string,
): string {
  const bare = title.trim();
  return teamLabel ? `${teamEventName(teamLabel)} - ${bare}` : bare;
}

/**
 * The team a tag names: a team key or a team's label, either way trimmed and
 * case-insensitive. Null when it names no team.
 */
export function teamForTag<T extends CalendarTeam>(
  tag: string | null | undefined,
  teams: readonly T[],
): T | null {
  const wanted = tag?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    teams.find((t) => t.key.toLowerCase() === wanted) ??
    teams.find((t) => t.label.trim().toLowerCase() === wanted) ??
    null
  );
}

/**
 * The rest of `summary` after "<Team label> Team - " for `team`, or null when
 * the title does not start with that team's name. Case-insensitive.
 */
function afterTeamName(summary: string, team: CalendarTeam): string | null {
  const text = summary.trimStart();
  const name = teamEventName(team.label);
  if (text.slice(0, name.length).toLowerCase() !== name.toLowerCase()) {
    return null;
  }
  const rest = text.slice(name.length);
  const separator = SEPARATOR.exec(rest);
  if (!separator) return null;
  const title = rest.slice(separator[0].length).trim();
  return title || null;
}

/**
 * Read an event's team and its bare title.
 *
 * The team comes from `tag` first (the app's private team property, or a
 * "[Tag]" on the title), then from a title that starts with a team's name in
 * the convention. The prefix is taken off only when it names one of the camp's
 * teams, so "[Cancelled] Burn night" and "Early Team - notes" (no such team)
 * keep every word. A title with nothing after its prefix is left whole.
 */
export function readTeamEvent<T extends CalendarTeam>(
  summary: string,
  tag: string | null,
  teams: readonly T[],
): { team: T | null; title: string } {
  const whole = summary.trim();
  const team = teamForTag(tag, teams);

  // The legacy "[Tag] " prefix, when its tag is a team.
  const bracket = parseTeamTag(summary);
  const bracketTeam = teamForTag(bracket.tag, teams);
  if (bracketTeam && bracket.title) {
    return { team: team ?? bracketTeam, title: bracket.title };
  }

  // The convention: the event's own team first; otherwise any team, longest
  // name first, so of two names that start alike the fuller one wins.
  const candidates = team
    ? [team]
    : [...teams].sort(
        (a, b) => teamEventName(b.label).length - teamEventName(a.label).length,
      );
  for (const candidate of candidates) {
    const title = afterTeamName(summary, candidate);
    if (title) return { team: team ?? candidate, title };
  }
  return { team, title: whole };
}
