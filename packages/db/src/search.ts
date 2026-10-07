import { sql, type SQL } from "drizzle-orm";
import {
  SEARCH_TEXT_LIMIT,
  announcementTextParts,
  chapterTextParts,
  findTextMatch,
  meetingTextParts,
  recipeTextParts,
  type SearchTextMatch,
  type SearchTextPart,
} from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { currentCycleNumber } from "./cycles";
import { createHttpDb } from "./index";
import { RESERVED_DEFINITION_KEYS } from "./questionnaire-definitions";
import { UNTITLED_RECIPE } from "./recipes";
import { DONE_VISIBLE_DAYS } from "./tasks";

// Ctrl+K "search everything" (#326, step 2): the entries a member may open,
// found by title or name. One statement, one branch per kind, each branch's
// WHERE a copy of the rule on the page the result opens, so search can never
// offer something its page would refuse. Read on demand while the box is
// open; nothing is indexed or stored.
//
// Inside text (#350): four kinds also have a text branch, for entries whose
// title does not hold every word but whose text (with the title) does: an
// accepted recipe version, a published chapter or duty card (members-only
// parts included: every member reads them in the app), a meeting's agenda,
// notes, decisions and action items, and an announcement as delivered to the
// viewer. Each with the SAME page rule as its title branch, plain ILIKE (no
// index, no migration: measured at 5–27 ms at the camp's size), at most
// SEARCH_TEXT_LIMIT a kind. The text reaches this module only to cut the
// short line a hit shows (findTextMatch, @camp404/core); a row never carries
// it out.
//
// A row carries only what the page it opens already shows this viewer: a
// title, and a few plain columns the web app turns into the detail line. No
// email, no handle, no notes, no prices, no decision notes, and nothing from a
// member's private record (payments, gear orders, answers) is ever selected.

export const SEARCH_KINDS = [
  "recipe",
  "chapter",
  "meeting",
  "task",
  "inventory",
  "shift",
  "gear",
  "lounge",
  "person",
  "announcement",
  "questionnaire",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Who is searching: the inputs every page rule below needs. */
export interface SearchViewer {
  /** The camp user's id (users.id). */
  userId: string;
  rank: ViewerRank;
  /** canRunLounge: a captain or a Ministry of Vibes lead. */
  runsLounge: boolean;
  /** canApproveRecipe: a captain or a Kitchen lead. */
  reviewsRecipes: boolean;
}

/**
 * One entry, as plain columns. What each column holds depends on the kind
 * (see the branches); a column a kind does not use is null.
 */
export interface SearchEntryRow {
  kind: SearchKind;
  id: string;
  title: string;
  team: string | null;
  /** A moment, in epoch milliseconds (a meeting, a due date, a send). */
  at: number | null;
  num: number | null;
  num2: number | null;
  label: string | null;
  extra: string | null;
  /** The address key when it is not the id (a chapter's slug). */
  ref: string | null;
  flag: boolean;
  /**
   * A text hit: where the words were found and about 110 characters around
   * them. Null for a title hit. Never the text itself.
   */
  match: SearchTextMatch | null;
}

/** The columns every row has, in order: the test pins this list. */
export const SEARCH_ROW_KEYS = [
  "kind",
  "id",
  "title",
  "team",
  "at",
  "num",
  "num2",
  "label",
  "extra",
  "ref",
  "flag",
  "match",
] as const;

/** At most this many words are matched; more are ignored. */
export const SEARCH_MAX_WORDS = 6;
/** How many rows one kind may return for a typed search. */
export const SEARCH_LIMIT_PER_KIND = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cols = {
  team?: SQL;
  at?: SQL;
  num?: SQL;
  num2?: SQL;
  label?: SQL;
  extra?: SQL;
  ref?: SQL;
  flag?: SQL;
};

interface Branch {
  kind: SearchKind;
  id: SQL;
  title: SQL;
  from: SQL;
  /** The page's own rule. */
  rule: SQL;
  cols: Cols;
  /** Newer first within the same match, where a kind has a date. */
  newest?: SQL;
  /** Search inside its text too (#350). */
  text?: TextBranch;
}

interface TextBranch {
  /** Where the text is read from; may narrow `from` (an accepted version). */
  from: SQL;
  /** The page's rule for the text (never wider than the branch's own). */
  rule: SQL;
  /** Every word of what is searched, as one string, values only. */
  haystack: SQL;
  /** The same text as jsonb, for findTextMatch (see textParts). */
  source: SQL;
}

/**
 * How many candidates a text branch reads for each hit it may show: a row
 * whose words are only in markup (a link's address) is dropped after the
 * query, so the cap is applied after that, never in SQL alone.
 */
const TEXT_OVERFETCH = 4;

/** A recipe body's searched values: jsonpath, so never a key or an enum. */
const RECIPE_TEXT_PATHS = [
  "$.summary ? (@ != null)",
  "$.ingredients[*].component ? (@ != null)",
  "$.ingredients[*].name",
  "$.ingredients[*].preparation ? (@ != null)",
  "$.ingredients[*].note ? (@ != null)",
  "$.steps[*].instruction",
  "$.steps[*].note ? (@ != null)",
  "$.notes[*].title ? (@ != null)",
  "$.notes[*].body",
];

/** A duty card's searched values. */
const CARD_TEXT_PATHS = [
  "$.steps[*]",
  "$.hardRules[*]",
  "$.checklist[*]",
  "$.subRoles[*].name",
  "$.askRole",
];

function jsonValues(column: SQL, paths: readonly string[]): SQL {
  return sql.join(
    paths.map(
      (path) =>
        sql`jsonb_path_query_array(${column}, ${sql.raw(`'${path}'`)}::jsonpath)::text`,
    ),
    sql`, `,
  );
}

/** The parts of a text hit's source, as the row says where it was found. */
function textParts(kind: SearchKind, source: unknown): SearchTextPart[] {
  const s = (source ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  switch (kind) {
    case "recipe":
      return recipeTextParts(s.body);
    case "chapter":
      return chapterTextParts(
        typeof s.markdown === "string" ? s.markdown : "",
        s.card,
      );
    case "meeting":
      return meetingTextParts({
        agenda: typeof s.agenda === "string" ? s.agenda : "",
        notes: typeof s.notes === "string" ? s.notes : "",
        decisions: strings(s.decisions),
        actions: strings(s.actions),
      });
    case "announcement":
      return announcementTextParts(typeof s.body === "string" ? s.body : "");
    default:
      return [];
  }
}

/** `%`, `_` and `\` typed into the box are letters, not wildcards. */
function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The typed text as lower-case words, at most SEARCH_MAX_WORDS. */
export function searchWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SEARCH_MAX_WORDS);
}

function branches(viewer: SearchViewer, cycle: number, now: Date): Branch[] {
  const me = sql`${viewer.userId}::uuid`;
  const doneSince = new Date(now.getTime() - DONE_VISIBLE_DAYS * 86_400_000);
  const list: Branch[] = [
    {
      // kitchen/recipes/[id]: in the book for everyone; before it, only for
      // its submitter and the Kitchen's reviewers.
      kind: "recipe",
      id: sql`r.id::text`,
      title: sql`coalesce(r.title, ${UNTITLED_RECIPE})`,
      from: sql`recipes r left join recipe_versions rv on rv.id = r.accepted_version_id`,
      rule: viewer.reviewsRecipes
        ? sql`true`
        : sql`(r.accepted_version_id is not null or r.submitter_id = ${me})`,
      cols: {
        num: sql`rv.servings_basis`,
        label: sql`case when r.accepted_version_id is null then r.status::text end`,
        flag: sql`coalesce(r.submitter_id = ${me}, false)`,
      },
      // The accepted version only, for everyone: what the Recipe tab shows.
      // A suggestion's working text is never searched, not even for its
      // submitter or a reviewer (they still find it by title).
      text: {
        from: sql`recipes r join recipe_versions rv on rv.id = r.accepted_version_id`,
        rule: sql`r.accepted_version_id is not null`,
        haystack: sql`concat_ws(' ', ${jsonValues(sql`rv.body`, RECIPE_TEXT_PATHS)})`,
        source: sql`jsonb_build_object('body', rv.body)`,
      },
    },
    {
      // guide/[slug]: the published version only; drafts are a writer's.
      kind: "chapter",
      id: sql`d.id::text`,
      title: sql`dv.title`,
      from: sql`documents d join document_versions dv on dv.document_id = d.id and dv.version = d.published_version`,
      rule: sql`d.published = true`,
      cols: {
        team: sql`dv.team::text`,
        label: sql`dv.kind::text`,
        extra: sql`dv.category`,
        ref: sql`d.slug`,
      },
      // The published version's text and card. Members-only parts too: the
      // in-app reader shows them to every member (the public site is another
      // app and never reaches this module).
      text: {
        from: sql`documents d join document_versions dv on dv.document_id = d.id and dv.version = d.published_version`,
        rule: sql`d.published = true`,
        haystack: sql`concat_ws(' ', dv.markdown, ${jsonValues(sql`dv.card`, CARD_TEXT_PATHS)})`,
        source: sql`jsonb_build_object('markdown', dv.markdown, 'card', dv.card)`,
      },
    },
    {
      // meetings/[id]: any member opens any meeting.
      kind: "meeting",
      id: sql`m.id::text`,
      title: sql`m.title`,
      from: sql`meeting_notes m`,
      rule: sql`true`,
      cols: {
        team: sql`m.team::text`,
        at: sql`(extract(epoch from m.held_at) * 1000)::float8`,
      },
      newest: sql`m.held_at desc`,
      // Its agenda, notes, decisions and action items: the page shows all
      // four to any member (owner, 2026-10-04: yes).
      text: {
        from: sql`meeting_notes m`,
        rule: sql`true`,
        haystack: sql`concat_ws(' ', m.agenda, m.notes,
          (select string_agg(x.text, ' ') from meeting_note_decisions x where x.note_id = m.id),
          (select string_agg(x.text, ' ') from meeting_note_action_items x where x.note_id = m.id))`,
        source: sql`jsonb_build_object('agenda', m.agenda, 'notes', m.notes,
          'decisions', coalesce((select jsonb_agg(x.text order by x.position) from meeting_note_decisions x where x.note_id = m.id), '[]'::jsonb),
          'actions', coalesce((select jsonb_agg(x.text order by x.position) from meeting_note_action_items x where x.note_id = m.id), '[]'::jsonb))`,
      },
    },
    {
      // tasks: every member sees the board, which holds the open tasks and
      // those done in the last DONE_VISIBLE_DAYS (listBoardTasks).
      kind: "task",
      id: sql`t.id::text`,
      title: sql`t.title`,
      from: sql`tasks t`,
      rule: sql`(t.status in ('open', 'in_progress') or (t.status = 'done' and t.completed_at >= ${doneSince.toISOString()}::timestamp))`,
      cols: {
        team: sql`t.team::text`,
        at: sql`(extract(epoch from t.due_at) * 1000)::float8`,
        label: sql`t.status::text`,
      },
      newest: sql`t.created_at desc`,
    },
    {
      // inventory/[id]: every member; archived items are left out.
      kind: "inventory",
      id: sql`i.id::text`,
      title: sql`i.name`,
      from: sql`inventory_items i`,
      rule: sql`i.archived_at is null`,
      cols: {
        team: sql`i.team::text`,
        num: sql`i.quantity`,
        label: sql`i.location`,
        extra: sql`i.unit`,
      },
    },
    {
      // shifts: this year's shifts, which every member reads.
      kind: "shift",
      id: sql`s.id::text`,
      title: sql`s.name`,
      from: sql`shift_types s`,
      rule: sql`s.cycle = ${cycle}`,
      cols: {
        team: sql`s.team::text`,
        num: sql`s.start_minute`,
        num2: sql`s.duration_minutes`,
      },
    },
    {
      // gear: what the camp rents out this year (never a price).
      kind: "gear",
      id: sql`g.id::text`,
      title: sql`g.name`,
      from: sql`rental_items g`,
      rule: sql`g.cycle = ${cycle} and g.archived_at is null`,
      cols: {
        num: sql`g.sleeps`,
        flag: sql`g.is_tent`,
      },
    },
    {
      // lounge: the programme (accepted and placed) and the member's own
      // offers; everyone's only for someone who runs the lounge.
      kind: "lounge",
      id: sql`o.id::text`,
      title: sql`o.title`,
      from: sql`lounge_offers o left join lateral (
        select ls.day, ls.start_minute from lounge_slots ls
        where ls.offer_id = o.id and ls.cycle = ${cycle}
        order by ls.day, ls.start_minute limit 1
      ) slot on true`,
      rule: viewer.runsLounge
        ? sql`o.cycle = ${cycle}`
        : sql`o.cycle = ${cycle} and (o.host_id = ${me} or (o.status = 'accepted' and slot.day is not null))`,
      cols: {
        num: sql`slot.day`,
        num2: sql`slot.start_minute`,
        label: sql`o.status`,
        flag: sql`o.host_id = ${me}`,
      },
    },
    {
      // The roster card: people already in camp, by display name. Not an
      // applicant waiting for a decision, not a Lost Cat, not a system user.
      kind: "person",
      id: sql`u.id::text`,
      title: sql`u.display_name`,
      from: sql`users u`,
      rule: sql`u.approval_status = 'approved' and u.sanitised = false and u.is_system = false and u.display_name is not null`,
      cols: {
        label: sql`u.rank::text`,
        extra: sql`(select string_agg(tm.team::text, ',' order by tm.team) from team_memberships tm where tm.user_id = u.id and tm.cycle = ${cycle})`,
        flag: sql`exists (select 1 from team_memberships tm where tm.user_id = u.id and tm.cycle = ${cycle} and tm.is_lead = true)`,
      },
    },
    {
      // announcements/[id]: only one delivered to the viewer, as delivered.
      kind: "announcement",
      id: sql`b.id::text`,
      title: sql`nd.title`,
      from: sql`notification_deliveries nd join broadcasts b on b.id = nd.broadcast_id`,
      rule: sql`nd.user_id = ${me} and b.kind = 'announcement' and b.published_at is not null`,
      cols: {
        team: sql`b.team::text`,
        at: sql`(extract(epoch from b.published_at) * 1000)::float8`,
        label: sql`b.scope::text`,
      },
      newest: sql`b.published_at desc`,
      // The body of the viewer's own copy (owner, 2026-10-04: yes).
      text: {
        from: sql`notification_deliveries nd join broadcasts b on b.id = nd.broadcast_id`,
        rule: sql`nd.user_id = ${me} and b.kind = 'announcement' and b.published_at is not null`,
        haystack: sql`nd.body`,
        source: sql`jsonb_build_object('body', nd.body)`,
      },
    },
  ];
  // captains/questionnaires/[key]: team lead and up, and a lead edits only
  // their own; never a coded questionnaire's reserved key.
  if (viewer.rank !== "camp_member") {
    const reserved = [...RESERVED_DEFINITION_KEYS];
    list.push({
      kind: "questionnaire",
      id: sql`q.key`,
      title: sql`q.title`,
      from: sql`questionnaire_definitions q`,
      rule: sql`${
        reserved.length > 0 ? sql`q.key not in ${reserved}` : sql`true`
      } and ${viewer.rank === "captain" ? sql`true` : sql`q.created_by = ${me}`}`,
      cols: { label: sql`q.status::text` },
      newest: sql`q.updated_at desc`,
    });
  }
  return list;
}

function select(
  b: Branch,
  match: SQL,
  order: SQL,
  limit: number | null,
  text?: TextBranch,
): SQL {
  const c = b.cols;
  return sql`(select ${b.kind}::text as kind, ${b.id} as id, ${b.title} as title,
    ${c.team ?? sql`null::text`} as team,
    ${c.at ?? sql`null::float8`} as at,
    ${c.num ?? sql`null::int`} as num,
    ${c.num2 ?? sql`null::int`} as num2,
    ${c.label ?? sql`null::text`} as label,
    ${c.extra ?? sql`null::text`} as extra,
    ${c.ref ?? sql`null::text`} as ref,
    ${c.flag ?? sql`false`} as flag,
    ${text ? text.source : sql`null::jsonb`} as source
    from ${text ? sql`${text.from} cross join lateral (select ${text.haystack} as haystack) st` : b.from}
    where ${text ? text.rule : b.rule} and ${match}
    order by ${order}${limit === null ? sql`` : sql` limit ${limit}`})`;
}

async function run(
  parts: SQL[],
  words: readonly string[] = [],
  textLimit = Infinity,
): Promise<SearchEntryRow[]> {
  if (parts.length === 0) return [];
  // Neon's HTTP driver and PGlite answer { rows }; another driver answers
  // the array itself. Both are read, as rate-limit.ts does.
  const result = (await createHttpDb().execute(
    sql.join(parts, sql` union all `),
  )) as unknown as
    | { rows?: Record<string, unknown>[] }
    | Record<string, unknown>[];
  const rows = Array.isArray(result) ? result : (result.rows ?? []);
  const textCount = new Map<SearchKind, number>();
  return rows.flatMap((r): SearchEntryRow[] => {
    const kind = r.kind as SearchKind;
    const title = String(r.title);
    let match: SearchTextMatch | null = null;
    if (r.source !== null && r.source !== undefined) {
      const source =
        typeof r.source === "string"
          ? (JSON.parse(r.source) as unknown)
          : r.source;
      match = findTextMatch(title, textParts(kind, source), words);
      // The words were only in markup (a link's address): no line to show,
      // so no hit.
      if (!match) return [];
      // The cap, counted over hits that have a line to show.
      const n = (textCount.get(kind) ?? 0) + 1;
      if (n > textLimit) return [];
      textCount.set(kind, n);
    }
    return [
      {
        kind,
        id: String(r.id),
        title,
        team: (r.team as string | null) ?? null,
        at: r.at === null || r.at === undefined ? null : Number(r.at),
        num: r.num === null || r.num === undefined ? null : Number(r.num),
        num2: r.num2 === null || r.num2 === undefined ? null : Number(r.num2),
        label: (r.label as string | null) ?? null,
        extra: (r.extra as string | null) ?? null,
        ref: (r.ref as string | null) ?? null,
        flag: r.flag === true,
        match,
      },
    ];
  });
}

/**
 * The entries whose title holds every typed word (any case, anywhere), at
 * most `limitPerKind` of each kind, in a rough order (where the first word
 * falls, then the shorter title); the browser ranks them finally. Then, for
 * the kinds with text, those whose title does not hold every word but whose
 * title and text together do, at most `textLimitPerKind` of each (newest
 * first where a kind has a date), each with its `match` line.
 */
export async function searchEntries(input: {
  viewer: SearchViewer;
  query: string;
  limitPerKind?: number;
  textLimitPerKind?: number;
  now?: Date;
}): Promise<SearchEntryRow[]> {
  const words = searchWords(input.query);
  if (words.length === 0 || !UUID.test(input.viewer.userId)) return [];
  const cycle = await currentCycleNumber();
  const limit = input.limitPerKind ?? SEARCH_LIMIT_PER_KIND;
  const textLimit = input.textLimitPerKind ?? SEARCH_TEXT_LIMIT;
  const parts: SQL[] = [];
  for (const b of branches(input.viewer, cycle, input.now ?? new Date())) {
    const inTitle = sql.join(
      words.map((w) => sql`${b.title} ilike ${likePattern(w)}`),
      sql` and `,
    );
    const order = sql.join(
      [
        sql`position(${words[0]!} in lower(${b.title}))`,
        sql`length(${b.title})`,
        ...(b.newest ? [b.newest] : []),
        sql`${b.id}`,
      ],
      sql`, `,
    );
    parts.push(select(b, inTitle, order, limit));
    if (b.text && textLimit > 0) {
      const inText = sql`not (${inTitle}) and ${sql.join(
        words.map(
          (w) =>
            sql`(${b.title} ilike ${likePattern(w)} or st.haystack ilike ${likePattern(w)})`,
        ),
        sql` and `,
      )}`;
      const textOrder = sql.join(
        [b.newest ?? sql`${b.title}`, sql`${b.id}`],
        sql`, `,
      );
      parts.push(
        select(b, inText, textOrder, textLimit * TEXT_OVERFETCH, b.text),
      );
    }
  }
  return run(parts, words, textLimit);
}

/** A remembered entry: what Recent keeps in the browser. */
export interface SearchRef {
  kind: SearchKind;
  id: string;
}

/**
 * Recent entries looked up again through the same rules: anything the viewer
 * may no longer open (or that is gone) is simply not returned. Order is the
 * caller's to restore.
 */
export async function resolveEntries(input: {
  viewer: SearchViewer;
  refs: readonly SearchRef[];
  now?: Date;
}): Promise<SearchEntryRow[]> {
  if (input.refs.length === 0 || !UUID.test(input.viewer.userId)) return [];
  const cycle = await currentCycleNumber();
  const parts: SQL[] = [];
  for (const b of branches(input.viewer, cycle, input.now ?? new Date())) {
    const ids = [
      ...new Set(input.refs.filter((r) => r.kind === b.kind).map((r) => r.id)),
    ];
    if (ids.length === 0) continue;
    parts.push(select(b, sql`${b.id} in ${ids}`, sql`${b.id}`, null));
  }
  return run(parts);
}
