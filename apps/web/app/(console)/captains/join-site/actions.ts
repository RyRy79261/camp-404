"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { JOIN_SECTION_KEYS, type JoinSectionKey } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  describeTeam,
  getJoinEditorData,
  JoinSectionInvalidError,
  saveJoinSection,
  setBurnDates,
} from "@/lib/join-site";

// Captain-only writes for join.camp-404.com (owner, 2026-09-25, decision 3A).
// The year is the camp's own, read on the server, never taken from the form.
// A problem with what was typed comes back as a sentence the editor shows
// beside the section.

export type JoinSiteResult = { ok: true } | { ok: false; error: string };

const PAGE = "/captains/join-site";

const SectionKey = z.enum(
  JOIN_SECTION_KEYS as [JoinSectionKey, ...JoinSectionKey[]],
);

export async function saveJoinSectionAction(
  section: string,
  value: unknown,
): Promise<JoinSiteResult> {
  const gate = await captainActionGate("captain");
  if (!gate.ok) return gate;
  const key = SectionKey.safeParse(section);
  if (!key.success) return { ok: false, error: "Unknown section." };

  const { year } = await getJoinEditorData();
  try {
    await saveJoinSection({
      year,
      section: key.data,
      value,
      actorUserId: gate.campUser.id,
    });
  } catch (error) {
    if (error instanceof JoinSectionInvalidError) {
      return { ok: false, error: error.issues[0] ?? "Check this section." };
    }
    throw error;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

const DateOrBlank = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
]);

export async function setBurnDatesAction(
  start: string,
  end: string,
): Promise<JoinSiteResult> {
  const gate = await captainActionGate("captain");
  if (!gate.ok) return gate;
  const s = DateOrBlank.safeParse(start);
  const e = DateOrBlank.safeParse(end);
  if (!s.success || !e.success || (s.data === "") !== (e.data === "")) {
    return { ok: false, error: "Give both days, or clear both." };
  }

  const { year, yearIsSet } = await getJoinEditorData();
  if (!yearIsSet) {
    return {
      ok: false,
      error: "Name the camp's year first, in Camp settings.",
    };
  }
  const res = await setBurnDates({
    year,
    burnStart: s.data || null,
    burnEnd: e.data || null,
    actorUserId: gate.campUser.id,
  });
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.reason === "invalid-dates"
          ? "The first day must be a real day, on or before the last day."
          : "The camp's year changed. Reload the page.",
    };
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function describeTeamAction(
  key: string,
  description: string,
): Promise<JoinSiteResult> {
  const gate = await captainActionGate("captain");
  if (!gate.ok) return gate;
  const { teams } = await getJoinEditorData();
  if (!teams.some((t) => t.key === key)) {
    return { ok: false, error: "Unknown team." };
  }
  if (description.trim().length > 200) {
    return { ok: false, error: "Keep it under 200 characters." };
  }
  await describeTeam({ key, description, actorUserId: gate.campUser.id });
  revalidatePath(PAGE);
  return { ok: true };
}
