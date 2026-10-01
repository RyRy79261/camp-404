import "server-only";

import { randomUUID } from "node:crypto";
import {
  canEditGuideChapter,
  canSetGuideChapterPublic,
  dutyCardProblem,
} from "@camp404/core";
import {
  CHAPTER_EDITED,
  CHAPTER_GONE,
  CHAPTER_NOT_PUBLISHED,
  CHAPTER_SLUG_TAKEN,
  NOTHING_TO_PUBLISH,
  NOT_A_CAMP_CHAPTER_WRITER,
  NOT_A_CHAPTER_WRITER,
  NOT_A_PUBLIC_MARKER,
  type DocumentKind,
  type DocumentTeam,
  type GuideChapter,
  type GuideChapterFields,
  type GuideChapterSummary,
  type GuideChapterVersion,
  type GuideDraft,
  type GuideWriteResult,
} from "@camp404/db/documents";
import { reachRank } from "@camp404/db/power";
import { DutyCard, type DutyCardDraft } from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of the Survival Guide's data (@camp404/db/documents), for
// E2E_TEST_MODE. The same rules, sentences and results over the store's own
// rows: a captain writes any chapter, a lead only their own team's, a
// whole-camp chapter is a captain's; each publish that changes something is a
// new version; a duty card is published only when its card is whole; the
// Public mark is a captain's; an edit is a compare-and-set on `version`. The
// store keeps no audit log and is one synchronous process, so there is nothing
// to lock. Kept apart from test-store.ts, which calls in here only to reset.

interface StoredChapter {
  id: string;
  slug: string;
  title: string;
  category: string;
  team: DocumentTeam | null;
  kind: DocumentKind;
  markdown: string;
  card: DutyCardDraft | null;
  version: number;
  authorId: string | null;
  published: boolean;
  publishedVersion: number | null;
  public: boolean;
  cycleReviewed: number | null;
  updatedAt: Date;
}

interface StoredVersion {
  documentId: string;
  version: number;
  title: string;
  category: string;
  team: DocumentTeam | null;
  kind: DocumentKind;
  markdown: string;
  card: DutyCard | null;
  publishedAt: Date;
  publishedBy: string | null;
}

interface GuideState {
  chapters: StoredChapter[];
  versions: StoredVersion[];
  /** `${userId}:${documentId}` -> the newest version read. */
  reads: Map<string, number>;
}

const KEY = "__camp404GuideTestStore__";

function state(): GuideState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    chapters: [],
    versions: [],
    reads: new Map(),
  } satisfies GuideState;
  return g[KEY] as GuideState;
}

/** Clear every chapter, version and read (testStore.reset calls this). */
export function resetGuideStore(): void {
  const s = state();
  s.chapters.length = 0;
  s.versions.length = 0;
  s.reads.clear();
}

const nameOf = (userId: string | null) =>
  (userId && testStore.findUserById(userId)?.displayName?.trim()) || null;

function writer(actorId: string) {
  if (!testStore.findUserById(actorId)) {
    return { rank: "camp_member", led: [] as string[] };
  }
  const reach = testStore.senderReach(actorId);
  return { rank: reachRank(reach), led: [...(reach ?? [])] };
}

function refusal(actorId: string, team: string | null): string | null {
  const w = writer(actorId);
  if (canEditGuideChapter(w.rank, w.led, team)) return null;
  return team === null ? NOT_A_CAMP_CHAPTER_WRITER : NOT_A_CHAPTER_WRITER;
}

function run<T extends object>(fn: () => T | string): GuideWriteResult<T> {
  const out = fn();
  return typeof out === "string"
    ? { ok: false, error: out }
    : { ok: true, ...out };
}

const canonical = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : x,
  );

function versionsOf(id: string): StoredVersion[] {
  return state()
    .versions.filter((v) => v.documentId === id)
    .sort((a, b) => b.version - a.version);
}

function live(c: StoredChapter): StoredVersion | null {
  if (!c.published || c.publishedVersion === null) return null;
  return versionsOf(c.id).find((v) => v.version === c.publishedVersion) ?? null;
}

function summary(c: StoredChapter, v: StoredVersion): GuideChapterSummary {
  return {
    id: c.id,
    slug: c.slug,
    title: v.title,
    category: v.category,
    team: v.team,
    kind: v.kind,
    version: v.version,
    publishedAt: v.publishedAt,
    cycleReviewed: c.cycleReviewed,
  };
}

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title);

function documentRow(c: StoredChapter) {
  return {
    ...c,
    card: c.card ? structuredClone(c.card) : null,
    createdAt: c.updatedAt,
  };
}

export const guideTestStore = {
  listPublishedChapters(input: { query?: string } = {}): GuideChapterSummary[] {
    const q = input.query?.trim().toLowerCase();
    return state()
      .chapters.map((c) => [c, live(c)] as const)
      .filter((pair): pair is [StoredChapter, StoredVersion] => !!pair[1])
      .filter(
        ([, v]) =>
          !q ||
          [v.title, v.markdown, v.card ? JSON.stringify(v.card) : ""].some(
            (text) => text.toLowerCase().includes(q),
          ),
      )
      .map(([c, v]) => summary(c, v))
      .sort(byTitle);
  },

  getPublishedChapter(slug: string): GuideChapter | null {
    const c = state().chapters.find((x) => x.slug === slug);
    const v = c ? live(c) : null;
    if (!c || !v) return null;
    return {
      ...summary(c, v),
      markdown: v.markdown,
      card: v.card ? structuredClone(v.card) : null,
      public: c.public,
      versions: versionsOf(c.id).map((x) => ({
        version: x.version,
        publishedAt: x.publishedAt,
        publishedByName: nameOf(x.publishedBy),
      })),
    };
  },

  listChapterVersions(documentId: string) {
    return versionsOf(documentId).map((x) => ({
      version: x.version,
      publishedAt: x.publishedAt,
      publishedByName: nameOf(x.publishedBy),
    }));
  },

  getChapterVersion(slug: string, version: number): GuideChapterVersion | null {
    const c = state().chapters.find((x) => x.slug === slug);
    const v = c && versionsOf(c.id).find((x) => x.version === version);
    if (!c || !v) return null;
    return {
      documentId: c.id,
      slug: c.slug,
      version: v.version,
      title: v.title,
      category: v.category,
      team: v.team,
      kind: v.kind,
      markdown: v.markdown,
      card: v.card ? structuredClone(v.card) : null,
      publishedAt: v.publishedAt,
      publishedByName: nameOf(v.publishedBy),
      chapter: {
        published: c.published,
        publishedVersion: c.publishedVersion,
        team: c.team,
      },
    };
  },

  listGuideDrafts(): GuideDraft[] {
    return state()
      .chapters.map((c) => {
        const last = versionsOf(c.id)[0];
        return {
          ...documentRow(c),
          authorName: nameOf(c.authorId),
          changedSincePublish:
            !last ||
            last.title !== c.title ||
            last.category !== c.category ||
            last.team !== c.team ||
            last.markdown !== c.markdown ||
            canonical(last.card) !== canonical(c.card),
        };
      })
      .map(({ createdAt: _createdAt, ...rest }) => rest)
      .sort(byTitle);
  },

  getGuideDraft(slug: string): GuideDraft | null {
    return this.listGuideDrafts().find((d) => d.slug === slug) ?? null;
  },

  listChapterReads(userId: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, version] of state().reads) {
      const [user, doc] = key.split(":") as [string, string];
      if (user === userId) out[doc] = version;
    }
    return out;
  },

  recordChapterRead(input: {
    userId: string;
    documentId: string;
    version: number;
  }): void {
    const key = `${input.userId}:${input.documentId}`;
    const had = state().reads.get(key) ?? 0;
    state().reads.set(key, Math.max(had, input.version));
  },

  createGuideChapter(
    input: GuideChapterFields & {
      actorId: string;
      slug: string;
      kind: DocumentKind;
    },
  ) {
    return run(() => {
      const refused = refusal(input.actorId, input.team);
      if (refused) return refused;
      if (state().chapters.some((c) => c.slug === input.slug)) {
        return CHAPTER_SLUG_TAKEN;
      }
      const row: StoredChapter = {
        id: randomUUID(),
        slug: input.slug,
        title: input.title,
        category: input.category,
        team: input.team,
        kind: input.kind,
        markdown: input.markdown,
        card:
          input.kind === "duty_card"
            ? structuredClone(
                input.card ?? {
                  shiftTypeKey: "",
                  subRoles: [],
                  steps: [],
                  hardRules: [],
                  checklist: [],
                  askRole: "",
                },
              )
            : null,
        version: 1,
        authorId: input.actorId,
        published: false,
        publishedVersion: null,
        public: false,
        cycleReviewed: null,
        updatedAt: new Date(),
      };
      state().chapters.push(row);
      return { document: documentRow(row) };
    });
  },

  saveGuideChapter(input: {
    actorId: string;
    slug: string;
    expectedVersion: number;
    change: Partial<GuideChapterFields>;
  }) {
    return run(() => {
      const c = state().chapters.find((x) => x.slug === input.slug);
      if (!c) return CHAPTER_GONE;
      const refused =
        refusal(input.actorId, c.team) ??
        (input.change.team !== undefined
          ? refusal(input.actorId, input.change.team)
          : null);
      if (refused) return refused;
      if (c.version !== input.expectedVersion) return CHAPTER_EDITED;
      const { card, ...rest } = input.change;
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) (c as unknown as Record<string, unknown>)[k] = v;
      }
      if (c.kind === "duty_card" && card) c.card = structuredClone(card);
      c.version += 1;
      c.updatedAt = new Date();
      return { document: documentRow(c) };
    });
  },

  publishGuideChapter(input: {
    actorId: string;
    slug: string;
    expectedVersion?: number;
  }) {
    return run(() => {
      const c = state().chapters.find((x) => x.slug === input.slug);
      if (!c) return CHAPTER_GONE;
      const refused = refusal(input.actorId, c.team);
      if (refused) return refused;
      if (
        input.expectedVersion !== undefined &&
        c.version !== input.expectedVersion
      ) {
        return CHAPTER_EDITED;
      }
      let card: DutyCard | null = null;
      if (c.kind === "duty_card") {
        const problem = dutyCardProblem(c.card, c.markdown);
        if (problem) return problem;
        card = DutyCard.parse(c.card);
      } else if (c.markdown.trim() === "") {
        return NOTHING_TO_PUBLISH;
      }
      const last = versionsOf(c.id)[0];
      const same =
        !!last &&
        last.title === c.title &&
        last.category === c.category &&
        last.team === c.team &&
        last.markdown === c.markdown &&
        canonical(last.card) === canonical(card);
      const version = same ? last.version : (last?.version ?? 0) + 1;
      if (!same) {
        state().versions.push({
          documentId: c.id,
          version,
          title: c.title,
          category: c.category,
          team: c.team,
          kind: c.kind,
          markdown: c.markdown,
          card,
          publishedAt: new Date(),
          publishedBy: input.actorId,
        });
      }
      c.published = true;
      c.publishedVersion = version;
      c.cycleReviewed = testStore.currentCycleNumber();
      c.updatedAt = new Date();
      return { version, created: !same };
    });
  },

  unpublishGuideChapter(input: { actorId: string; slug: string }) {
    return run(() => {
      const c = state().chapters.find((x) => x.slug === input.slug);
      if (!c) return CHAPTER_GONE;
      const refused = refusal(input.actorId, c.team);
      if (refused) return refused;
      c.published = false;
      return {};
    });
  },

  markGuideChapterReviewed(input: { actorId: string; slug: string }) {
    return run(() => {
      const c = state().chapters.find((x) => x.slug === input.slug);
      if (!c) return CHAPTER_GONE;
      const refused = refusal(input.actorId, c.team);
      if (refused) return refused;
      if (!c.published) return CHAPTER_NOT_PUBLISHED;
      c.cycleReviewed = testStore.currentCycleNumber();
      return { cycle: c.cycleReviewed };
    });
  },

  setGuideChapterPublic(input: {
    actorId: string;
    slug: string;
    public: boolean;
  }) {
    return run(() => {
      if (!canSetGuideChapterPublic(writer(input.actorId).rank)) {
        return NOT_A_PUBLIC_MARKER;
      }
      const c = state().chapters.find((x) => x.slug === input.slug);
      if (!c) return CHAPTER_GONE;
      c.public = input.public;
      return {};
    });
  },
};
