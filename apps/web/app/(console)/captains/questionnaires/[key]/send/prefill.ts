import type { AudienceChoice } from "@/components/questionnaires/activation-form";

// The send screen's pre-fill, from AfrikaBurn's activate page: the editor can
// hand its choices over in the query string, and the author still confirms
// every one of them on the form.
//
//   ?audience=everyone | team_leads | individual | team:<team key>
//   ?blocking=1
//   ?due=YYYY-MM-DD  or  YYYY-MM-DDTHH:mm
//
// Parsed defensively: an unrecognised value pre-fills nothing. This decides
// nothing about access. The page drops a scope the viewer isn't offered, the
// form drops a team it doesn't list, and `sendAction` authorises the send.

export interface SendPrefill {
  audience: AudienceChoice | null;
  blocking: boolean;
  /** A `datetime-local` value, or undefined. */
  dueAt: string | undefined;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseAudience(raw: string | undefined): AudienceChoice | null {
  if (!raw) return null;
  if (raw === "everyone" || raw === "team_leads" || raw === "individual") {
    return { scope: raw };
  }
  if (raw.startsWith("team:")) {
    const team = raw.slice("team:".length);
    return /^[a-z0-9_]+$/.test(team) ? { scope: "team", team } : null;
  }
  return null;
}

function parseDue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // A date alone is due at the end of that day, wall-clock.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;
  return undefined;
}

export function parseSendPrefill(
  query: Record<string, string | string[] | undefined>,
): SendPrefill {
  return {
    audience: parseAudience(first(query.audience)),
    blocking: first(query.blocking) === "1",
    dueAt: parseDue(first(query.due)),
  };
}
