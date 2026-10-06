import { AREAS, type Area } from "../mcp/capabilities";

// Which of the connector's areas a spoken command touches (#356, cost): only
// those areas' tools go to Claude, not all ninety. A deterministic step on
// the server, no model call: plain word lists per area.
//
// It errs one way only. A word that could belong to two areas adds both. Two
// areas are always sent (People, to find anyone by name and for every team
// and lead change; Search). And when no
// list matches anything beyond those two, every area is sent, as before.
// So a miss can only cost tokens; it can never hide a tool that a matched
// word asked for. A tool Claude still lacks shows up as an `unsure` or a
// `cannot`, a refusal, never as a wrong action.

/** Sent with every command. */
export const ALWAYS: readonly Area[] = ["People", "Search"];

/** Each area's words, as one regular expression over the lowered words. */
const WORDS: Partial<Record<Area, RegExp>> = {
  // Team and lead changes, and who is who. People is always sent; matching it
  // only means the command is not unknown.
  People:
    /\b(teams?|leads?|leader|leading|captain|member|members|roster|who|kitchen|structures|power|lighting|sanitation|safety|art|activities|memes|vibes|finance|transport|logistics|comms|put \w+( \w+)? on|take \w+( \w+)? off|add \w+( \w+)? to|move \w+( \w+)? from)\b/,
  You: /\b(my profile|profile|dietary|diet|allerg\w*|vegan|vegetarian|emergency|contact|membership|tier|whole event|build week only|skills?|burns? (i'?ve|i have)|first burn|history|dues|owe|gear order|my forms|required|driver profile|my car)\b/,
  Inbox: /\b(notifications?|inbox|unread|mark .* read|messages?)\b/,
  Tasks:
    /\b(tasks?|to ?do|board|done|doing|in progress|reopen|started?|finish(ed)?|complete[d]?|assign(ed)?|deadline|due)\b/,
  Calendar:
    /\b(calendar|events?|tomorrow|today|tonight|this week|next week|what'?s on|happening|when|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  Meetings: /\b(meetings?|agenda|minutes|notes|decisions?)\b/,
  Shifts:
    /\b(shifts?|sign (me )?up|signup|put me on|take me off|leave|cooks?|cooking|wash[- ]?up|breakfast|lunch|dinner|bar|moop|sweep|generator|duty|rota|roster|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/,
  "Claims and budgets":
    /\b(claims?|approve[ds]?|reject(ed)?|turn (it )?down|decline|reimburs\w*|budgets?|pay|paid|money|rand|r ?\d[\d,]*|receipts?|spent|spend|costs?|bought|deposit)\b/,
  "Survival Guide":
    /\b(guide|chapters?|duty cards?|documents?|draft|publish(ed)?|unpublish)\b/,
  Questionnaires: /\b(questionnaires?|forms?|survey|questions)\b/,
  Kitchen:
    /\b(recipes?|meal|meals|menu|shopping|ingredients?|food|dish|lesson|plates?|cook'?s note)\b/,
  Inventory:
    /\b(gear|inventory|items?|stock|equipment|tents?|tarps?|count|how many .* (have|got)|storage|condition|broken)\b/,
  Logistics:
    /\b(build|strike|pack|unpack|packing|travel|help (on|with|at)|can'?t (make|help|come)|maybe for|attendance|phases?|camp days|burn days|dates?)\b/,
  Transport:
    /\b(lifts?|cars?|ride|riding|rider|driver|driving|drive|seats?|transport|truck|trailer)\b/,
  "Invites and audit": /\b(invites?|codes?|revoke|audit|log)\b/,
};

export interface AreaPick {
  areas: Area[];
  /** True when no word list matched at all: every area went. */
  fallback: boolean;
}

/** The areas a command's words touch, generously. */
export function pickAreas(words: string): AreaPick {
  const text = words.toLowerCase().replace(/[’‘]/g, "'");
  const hit = new Set<Area>(ALWAYS);
  let matched = false;
  for (const [area, re] of Object.entries(WORDS) as [Area, RegExp][]) {
    if (re.test(text)) {
      hit.add(area);
      matched = true;
    }
  }
  if (!matched) {
    return { areas: [...AREAS], fallback: true };
  }
  // Where one area's work leans on another's reads, send both.
  if (hit.has("Shifts")) hit.add("Calendar");
  if (hit.has("Logistics")) hit.add("Calendar");
  if (hit.has("Calendar") && /\b(what'?s on|happening|when)\b/.test(text)) {
    hit.add("Meetings");
    hit.add("Tasks");
    hit.add("Shifts");
    hit.add("Logistics");
  }
  return { areas: AREAS.filter((a) => hit.has(a)), fallback: false };
}
