// "Find decisions and action items" (owner, 2026-10-11): Claude reads a
// meeting's agenda and notes and PROPOSES decisions and action items. Pure:
// no DB, no session, no model call. This module turns Claude's checked answer
// into what the editor shows, and it never trusts the answer's people, teams
// or dates on their own:
//
//  - A person becomes an assignee only when the name Claude gives matches
//    exactly ONE member's whole name (case, spaces and accents aside), among
//    everyone in camp when the caller passes them, AND that whole name is
//    written in the agenda or the notes. So Claude cannot turn "Mike" in the
//    notes into "Mike Smith": the notes never said it, and the writer is asked.
//    A name that matches nobody, or two people, is "Who is this?" with no
//    guess: "Speaker 3" and "Team leads" stay a question for the writer.
//  - A team is kept only when it is one of the active teams sent ("camp" is
//    the whole camp); otherwise the action item is filed where the meeting is
//    (its team, or the whole camp).
//  - A due date is kept only when it is a real calendar day.
//  - Anything already on the note (the same words, case and spaces aside),
//    or that Claude marked as already listed, is not proposed again; it is
//    counted, so the editor can say so.
//
// Nothing here is stored: the proposals live in the open editor until the
// writer keeps them and saves the meeting.

export interface SuggestionMember {
  id: string;
  displayName: string;
}

export interface SuggestedDecision {
  text: string;
}

export interface SuggestedActionItem {
  text: string;
  /** The member it matched, or null for "Who is this?" (or nobody named). */
  assigneeId: string | null;
  /** The name as the notes give it, when it matched nobody; else null. */
  unmatchedName: string | null;
  /** Where the task is filed: a team key, or null for the whole camp. */
  team: string | null;
  /** A camp day, YYYY-MM-DD, or null. */
  due: string | null;
  /** The notes' words the date was worked out from ("next week"), or null. */
  dueSaid: string | null;
}

export interface MeetingSuggestions {
  decisions: SuggestedDecision[];
  actionItems: SuggestedActionItem[];
  /** How many of each Claude found that the note already holds. */
  alreadyThere: { decisions: number; actionItems: number };
}

/** The raw answer, already checked against MeetingSuggestionAnswer. */
export interface MeetingSuggestionRaw {
  decisions: readonly { text: string; already_listed: boolean }[];
  action_items: readonly {
    text: string;
    person: string | null;
    team: string | null;
    due: string | null;
    due_said: string | null;
    already_listed: boolean;
  }[];
}

/** What Claude answers for an action item filed under the whole camp. */
export const WHOLE_CAMP_KEY = "camp";

/** The longest line the editor takes (MeetingMinutesInput). */
export const SUGGESTED_DECISION_MAX = 500;
export const SUGGESTED_ACTION_ITEM_MAX = 120;
/** At most this many of each are proposed (the note's list limit). */
export const SUGGESTIONS_MAX = 50;

/** A name or a line, compared: no case, accents or repeated spaces. */
export function comparable(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The one member whose whole name is `name`, or null: no match, two members
 * with that name, or no name at all. Never a guess from part of a name. With
 * `said` (the agenda and the notes), the whole name must also be written
 * there, as words of its own.
 */
export function matchMember(
  name: string | null,
  members: readonly SuggestionMember[],
  said?: string,
): string | null {
  if (!name) return null;
  const wanted = comparable(name);
  if (!wanted) return null;
  if (said !== undefined && !` ${comparable(said)} `.includes(` ${wanted} `)) {
    return null;
  }
  const hits = members.filter((m) => comparable(m.displayName) === wanted);
  return hits.length === 1 ? hits[0]!.id : null;
}

/** The longest "From “…”" the editor shows under a suggested date. */
export const DUE_SAID_MAX = 80;

/** Whether `day` is a real calendar day written YYYY-MM-DD. */
export function isCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(day);
}

/** Cut a line to `max` characters at a word, with no trailing punctuation. */
function fit(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(
    /[\s,;:.-]+$/,
    "",
  );
}

/**
 * Claude's answer, made safe for the editor: matched people, known teams,
 * real dates, nothing already on the note, nothing twice.
 */
export function meetingSuggestionsFrom(
  raw: MeetingSuggestionRaw,
  context: {
    /** Who Claude was told about. */
    members: readonly SuggestionMember[];
    /**
     * Every approved member in camp, so a name two people share is never
     * matched to the one Claude was told about; defaults to `members`.
     */
    everyone?: readonly SuggestionMember[];
    /** The agenda and the notes Claude read: a matched name must be in them. */
    said: string;
    /** The active teams' keys. */
    teams: readonly string[];
    /** The meeting's own team (null for the whole camp). */
    meetingTeam: string | null;
    /** What the note holds already. */
    existing: { decisions: readonly string[]; actionItems: readonly string[] };
  },
): MeetingSuggestions {
  const teams = new Set(context.teams);
  const fallbackTeam =
    context.meetingTeam && teams.has(context.meetingTeam)
      ? context.meetingTeam
      : null;
  const heldDecisions = new Set(context.existing.decisions.map(comparable));
  const heldItems = new Set(context.existing.actionItems.map(comparable));

  const decisions: SuggestedDecision[] = [];
  let decisionsThere = 0;
  for (const d of raw.decisions) {
    const text = fit(d.text, SUGGESTED_DECISION_MAX);
    const key = comparable(text);
    if (!key) continue;
    if (d.already_listed || heldDecisions.has(key)) {
      decisionsThere += 1;
      heldDecisions.add(key);
      continue;
    }
    if (decisions.length >= SUGGESTIONS_MAX) continue;
    heldDecisions.add(key);
    decisions.push({ text });
  }

  const actionItems: SuggestedActionItem[] = [];
  let itemsThere = 0;
  for (const item of raw.action_items) {
    const text = fit(item.text, SUGGESTED_ACTION_ITEM_MAX);
    const key = comparable(text);
    if (!key) continue;
    if (item.already_listed || heldItems.has(key)) {
      itemsThere += 1;
      heldItems.add(key);
      continue;
    }
    if (actionItems.length >= SUGGESTIONS_MAX) continue;
    heldItems.add(key);
    const person = item.person?.trim() || null;
    const assigneeId = matchMember(
      person,
      context.everyone ?? context.members,
      context.said,
    );
    const due = item.due && isCalendarDay(item.due) ? item.due : null;
    const dueSaid = due ? item.due_said?.trim() || null : null;
    actionItems.push({
      text,
      assigneeId,
      unmatchedName: assigneeId === null ? person : null,
      team:
        item.team === WHOLE_CAMP_KEY
          ? null
          : item.team && teams.has(item.team)
            ? item.team
            : fallbackTeam,
      due,
      dueSaid: dueSaid ? fit(dueSaid, DUE_SAID_MAX) : null,
    });
  }

  return {
    decisions,
    actionItems,
    alreadyThere: { decisions: decisionsThere, actionItems: itemsThere },
  };
}
