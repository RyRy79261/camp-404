"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { JOIN_SECTION_KEYS, type JoinSectionKey } from "@camp404/types";
import { isIsoDate } from "@camp404/db/camp-config";
import { captainActionGate } from "@/lib/captain-gate";
import {
  describeTeam,
  getJoinEditorData,
  JoinSectionInvalidError,
  saveJoinSections,
  setBurnDates,
} from "@/lib/join-site";
import { runAction } from "@/lib/action-result";

// Captain-only writes for join.camp-404.com and About Camp 404 (owner,
// 2026-09-25, decision 3A). The editor has one Save for the whole page
// (approved redesign, 2026-10-01): it sends only the sections a captain
// changed, and this checks every one of them before anything is written, so
// a mistake in one section saves nothing and says which section it is in.
// The year is the camp's own, read on the server, never taken from the form.

export type JoinSiteResult =
  | { ok: true }
  /** `section`: where the problem is, so the editor can open it. */
  | { ok: false; error: string; section?: JoinSectionKey };

const PAGE = "/captains/join-site";

const SectionKey = z.enum(
  JOIN_SECTION_KEYS as [JoinSectionKey, ...JoinSectionKey[]],
);

const DateOrBlank = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
]);

const PageInput = z.object({
  sections: z.partialRecord(SectionKey, z.unknown()).default({}),
  /** What each team does, by team key; blank goes back to the default. */
  teamLines: z.record(z.string(), z.string()).optional(),
  /** The Burn's first and last day, or both blank to clear them. */
  burn: z.object({ start: DateOrBlank, end: DateOrBlank }).optional(),
});
export type JoinPageInput = z.input<typeof PageInput>;

export async function saveJoinPageAction(
  input: JoinPageInput,
): Promise<JoinSiteResult> {
  return runAction("saveJoinPageAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;
    const parsed = PageInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Reload the page." };
    const { sections, teamLines, burn } = parsed.data;
    const data = await getJoinEditorData();

    // Everything is checked before anything is written.
    if (teamLines) {
      for (const [key, line] of Object.entries(teamLines)) {
        if (!data.teams.some((t) => t.key === key)) {
          return { ok: false, error: "Unknown team.", section: "teams" };
        }
        if (line.trim().length > 200) {
          const label = data.teams.find((t) => t.key === key)?.label ?? key;
          return {
            ok: false,
            error: `${label}: keep it under 200 characters.`,
            section: "teams",
          };
        }
      }
    }
    if (burn) {
      const clearing = burn.start === "" && burn.end === "";
      if (!clearing && (burn.start === "" || burn.end === "")) {
        return {
          ok: false,
          error: "Give both days, or clear both.",
          section: "schedule",
        };
      }
      if (
        !clearing &&
        !(
          isIsoDate(burn.start) &&
          isIsoDate(burn.end) &&
          burn.start <= burn.end
        )
      ) {
        return {
          ok: false,
          error: "The first day must be a real day, on or before the last day.",
          section: "schedule",
        };
      }
      if (!data.yearIsSet) {
        return {
          ok: false,
          error: "Name the camp's year first, in Camp settings.",
          section: "schedule",
        };
      }
    }

    try {
      await saveJoinSections({
        year: data.year,
        sections,
        actorUserId: gate.campUser.id,
      });
    } catch (error) {
      if (error instanceof JoinSectionInvalidError) {
        return {
          ok: false,
          error: error.issues[0] ?? "Check this section.",
          section: error.section,
        };
      }
      throw error;
    }

    for (const [key, line] of Object.entries(teamLines ?? {})) {
      await describeTeam({
        key,
        description: line,
        actorUserId: gate.campUser.id,
      });
    }

    if (burn) {
      const res = await setBurnDates({
        year: data.year,
        burnStart: burn.start || null,
        burnEnd: burn.end || null,
        actorUserId: gate.campUser.id,
      });
      if (!res.ok) {
        return {
          ok: false,
          error:
            "The words are saved, but not the Burn's dates: the camp's year changed. Reload the page.",
          section: "schedule",
        };
      }
    }

    revalidatePath(PAGE);
    revalidatePath("/about");
    return { ok: true };
  });
}
