import { and, desc, eq, lte, sql } from "drizzle-orm";
import {
  DEFAULT_JOIN_CONTENT,
  DEFAULT_TEAM_DESCRIPTIONS,
  JoinSections,
  resolveJoinContent,
  type JoinSectionKey,
  type JoinSiteContent,
} from "@camp404/types";
import {
  activeTeams,
  currentCycle,
  resolveCycles,
  resolveTeamsConfig,
} from "./camp-config";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// join.camp-404.com's data: the words captains edit (join_site_content), plus
// what the camp already records (the year and the Burn's dates, the team list,
// captains who chose to be shown, and this year's headcount). The join app
// reads getJoinSitePublic() on its own server; the app's editor reads
// getJoinSiteContent() and writes saveJoinSiteSection().

/** A captain's card, as they wrote it on their profile. */
export type JoinCaptain = { name: string; title: string; blurb: string };

/** Where this year's members stand; each member counts once. Counts only. */
export type JoinHeadcount = {
  accepted: number;
  applied: number;
  maybe: number;
};

export type JoinTeam = { key: string; label: string; description: string };

export type JoinSitePublic = {
  /** The camp's current burn year; null before a captain names one. */
  year: number | null;
  yearName: string | null;
  burn: { start: string; end: string } | null;
  content: JoinSiteContent;
  teams: JoinTeam[];
  captains: JoinCaptain[];
  headcount: JoinHeadcount | null;
};

/**
 * The words for one year: its own row, else the latest earlier year's (words
 * carry forward), else the defaults. `from` says which year they came from.
 */
export async function getJoinSiteContent(
  year: number | null,
  db: DbOrTx = createHttpDb(),
): Promise<{ content: JoinSiteContent; from: number | null }> {
  const rows = await db
    .select({
      cycle: schema.joinSiteContent.cycle,
      content: schema.joinSiteContent.content,
    })
    .from(schema.joinSiteContent)
    .where(year === null ? undefined : lte(schema.joinSiteContent.cycle, year))
    .orderBy(desc(schema.joinSiteContent.cycle))
    .limit(1);
  const row = rows[0];
  return row
    ? { content: resolveJoinContent(row.content), from: row.cycle }
    : { content: DEFAULT_JOIN_CONTENT, from: null };
}

export class JoinSectionInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(" "));
  }
}

/**
 * Save one section of one year's words. Checked by the section's schema; the
 * rest of the document is kept (from this year's row, or carried forward from
 * the last year that had one). The row is created and locked first, so two
 * captains saving different sections at once both land. The audit row commits
 * with the change.
 */
export async function saveJoinSiteSection<K extends JoinSectionKey>(input: {
  year: number;
  section: K;
  value: unknown;
  actorUserId: string;
}): Promise<JoinSiteContent> {
  const parsed = JoinSections[input.section].safeParse(input.value);
  if (!parsed.success) {
    throw new JoinSectionInvalidError(
      parsed.error.issues.map((i) => i.message),
    );
  }

  return await withTransaction(async (tx) => {
    const { content: base } = await getJoinSiteContent(input.year, tx);
    await tx
      .insert(schema.joinSiteContent)
      .values({ cycle: input.year, content: base })
      .onConflictDoNothing({ target: schema.joinSiteContent.cycle });
    const [locked] = await tx
      .select({ content: schema.joinSiteContent.content })
      .from(schema.joinSiteContent)
      .where(eq(schema.joinSiteContent.cycle, input.year))
      .for("update");

    const next: JoinSiteContent = {
      ...resolveJoinContent(locked?.content),
      [input.section]: parsed.data,
    };
    await tx
      .update(schema.joinSiteContent)
      .set({
        content: next,
        updatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(schema.joinSiteContent.cycle, input.year));
    await writeAuditEvent(tx, {
      actorId: input.actorUserId,
      action: "join_site.section_saved",
      target: `join_site:${input.year}`,
      metadata: { section: input.section, year: input.year },
    });
    return next;
  });
}

/** Captains who ticked "show me on join.camp-404.com", by name. */
export async function getJoinCaptains(
  db: DbOrTx = createHttpDb(),
): Promise<JoinCaptain[]> {
  const rows = await db
    .select({
      name: schema.users.displayName,
      title: schema.users.campTitle,
      blurb: schema.users.campBlurb,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.rank, "captain"),
        eq(schema.users.showOnJoin, true),
        eq(schema.users.sanitised, false),
        eq(schema.users.isSystem, false),
      ),
    )
    .orderBy(schema.users.displayName);
  return rows
    .filter((r) => (r.name ?? "").trim() !== "")
    .map((r) => ({
      name: r.name!.trim(),
      title: (r.title ?? "").trim() || "Captain",
      blurb: (r.blurb ?? "").trim(),
    }));
}

/** This year's headcount by where members stand. Never names. */
export async function getJoinHeadcount(
  year: number,
  db: DbOrTx = createHttpDb(),
): Promise<JoinHeadcount> {
  const rows = await db
    .select({
      status: schema.campParticipations.status,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.campParticipations)
    .where(eq(schema.campParticipations.cycle, year))
    .groupBy(schema.campParticipations.status);
  const count = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return {
    accepted: count("accepted"),
    applied: count("applied"),
    maybe: count("maybe"),
  };
}

/** Everything join.camp-404.com shows, read in one go. Public fields only. */
export async function getJoinSitePublic(
  db: DbOrTx = createHttpDb(),
): Promise<JoinSitePublic> {
  const [settings] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  const cycle = currentCycle(resolveCycles(settings?.config));
  const year = cycle?.year ?? null;
  const teamsConfig = resolveTeamsConfig(settings?.config);

  const [{ content }, captains, headcount] = await Promise.all([
    getJoinSiteContent(year, db),
    getJoinCaptains(db),
    year === null ? Promise.resolve(null) : getJoinHeadcount(year, db),
  ]);

  return {
    year,
    yearName: cycle?.name ?? null,
    burn:
      cycle?.burnStart && cycle.burnEnd
        ? { start: cycle.burnStart, end: cycle.burnEnd }
        : null,
    content,
    teams: activeTeams(teamsConfig).map((t) => ({
      key: t.key,
      label: t.label,
      description:
        t.description?.trim() || DEFAULT_TEAM_DESCRIPTIONS[t.key] || "",
    })),
    captains,
    headcount,
  };
}

/** "What I am in camp": the member's own optional title and blurb. */
export type CampBlurb = {
  title: string | null;
  blurb: string | null;
  /** A captain's card on join.camp-404.com; only captains' cards are shown. */
  showOnJoin: boolean;
};

export const MAX_CAMP_TITLE_LENGTH = 60;
export const MAX_CAMP_BLURB_LENGTH = 280;

export async function getCampBlurb(
  userId: string,
  db: DbOrTx = createHttpDb(),
): Promise<CampBlurb> {
  const [row] = await db
    .select({
      title: schema.users.campTitle,
      blurb: schema.users.campBlurb,
      showOnJoin: schema.users.showOnJoin,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row ?? { title: null, blurb: null, showOnJoin: false };
}

/**
 * The member's own words about themselves, written from their profile. Their
 * own data, so no audit row (like their display name). Blank reads as none.
 */
export async function setCampBlurb(
  userId: string,
  input: CampBlurb,
  db: DbOrTx = createHttpDb(),
): Promise<void> {
  const clean = (v: string | null, max: number) => {
    const t = (v ?? "").trim().slice(0, max);
    return t === "" ? null : t;
  };
  await db
    .update(schema.users)
    .set({
      campTitle: clean(input.title, MAX_CAMP_TITLE_LENGTH),
      campBlurb: clean(input.blurb, MAX_CAMP_BLURB_LENGTH),
      showOnJoin: input.showOnJoin,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}
