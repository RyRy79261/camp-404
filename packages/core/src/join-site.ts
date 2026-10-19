import {
  JOIN_SECTION_KEYS,
  JoinSections,
  type JoinSectionKey,
} from "@camp404/types";

// The words of join.camp-404.com and the captains' cards on it, as both the
// database writer (@camp404/db/join-site) and the E2E store check them. Pure:
// no database, no session.

export const MAX_CAMP_TITLE_LENGTH = 60;
export const MAX_CAMP_BLURB_LENGTH = 280;

/**
 * The sections a captain saved, each checked by its schema, in the join
 * site's section order; or the first that fails, with its issues. One bad
 * section saves none.
 */
export function parseJoinSections(
  sections: Partial<Record<JoinSectionKey, unknown>>,
):
  | { ok: true; parsed: Partial<Record<JoinSectionKey, unknown>> }
  | { ok: false; section: JoinSectionKey; issues: string[] } {
  const parsed: Partial<Record<JoinSectionKey, unknown>> = {};
  for (const key of JOIN_SECTION_KEYS) {
    if (!(key in sections)) continue;
    const result = JoinSections[key].safeParse(sections[key]);
    if (!result.success) {
      return {
        ok: false,
        section: key,
        issues: result.error.issues.map((i) => i.message),
      };
    }
    parsed[key] = result.data;
  }
  return { ok: true, parsed };
}

/**
 * A member's "what I am in camp" card as it is stored: each text trimmed and
 * cut to its limit, blank as none.
 */
export function campBlurbToSave(input: {
  title: string | null;
  blurb: string | null;
  showOnJoin: boolean;
}): { title: string | null; blurb: string | null; showOnJoin: boolean } {
  const clean = (v: string | null, max: number) => {
    const t = (v ?? "").trim().slice(0, max);
    return t === "" ? null : t;
  };
  return {
    title: clean(input.title, MAX_CAMP_TITLE_LENGTH),
    blurb: clean(input.blurb, MAX_CAMP_BLURB_LENGTH),
    showOnJoin: input.showOnJoin,
  };
}
