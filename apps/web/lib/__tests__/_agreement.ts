import { eq } from "drizzle-orm";
import { INTENT_IMPLIED_BY_STATUS } from "@camp404/core";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { Team, type ParticipationStatus } from "@camp404/types";
import type { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../packages/db/src/__tests__/_factories";
import { testStore } from "../test-store";

// The shared half of the agreement suites (lib/__tests__/*-agreement.test.ts).
// An agreement suite runs one scenario twice through a domain's FACADE: once
// with the test store off, against real Postgres (PGlite, the packages/db
// harness), and once with it on, against the in-memory store. Both runs seed
// the same camp the same way (the personas below, through each side's own
// writers), and the two answers, refusals included, must be equal once ids
// and clocks are taken out (`normalise`).
//
// A suite file mocks "@/lib/test-mode" itself (vi.mock is hoisted per file)
// and hands its switch to `bothWays`:
//
//   const mode = vi.hoisted(() => ({ on: false }));
//   vi.mock("@/lib/test-mode", () => ({
//     isE2ETestMode: () => mode.on,
//     usesTestStore: () => mode.on,
//     TEST_USER_COOKIE: "camp404_test_user",
//   }));
//
// PGlite has ONE connection: a scenario awaits each call before the next.

type Harness = ReturnType<typeof useTestDb>;
export type DB = ReturnType<Harness["db"]>;

/** The burn year every agreement suite runs in. */
export const YEAR = 2027;

/** How a scenario seeds the camp, the same on both sides. */
export interface Seed {
  readonly side: "db" | "store";
  /** A new member (approved unless `approval` says otherwise); their id. */
  user(
    name: string,
    options?: {
      rank?: "captain" | "member";
      approval?: "approved" | "pending";
    },
  ): Promise<string>;
  /** On `team` this year. */
  join(userId: string, team: Team): Promise<void>;
  /** On `team` this year, and its lead. */
  lead(userId: string, team: Team): Promise<void>;
  /** Their place this year, with the answer that status stands for. */
  participation(userId: string, status: ParticipationStatus): Promise<void>;
}

/** The people every agreement suite starts with. */
export interface People {
  captain: string;
  /** A lead of Finance: the money domains' "lead of this team". */
  financeLead: string;
  /** A lead of Kitchen: a lead of ANOTHER team, refused where Finance is asked. */
  kitchenLead: string;
  member: string;
  other: string;
}

function dbSeed(db: DB): Seed {
  return {
    side: "db",
    async user(name, options = {}) {
      const row = await makeUser(db, {
        displayName: name,
        rank: options.rank ?? "member",
        approvalStatus: options.approval ?? "approved",
      });
      return row.id;
    },
    async join(userId, team) {
      await assignTeam({ userId, team });
    },
    async lead(userId, team) {
      await assignTeam({ userId, team });
      await setLead({ userId, team, isLead: true });
    },
    async participation(userId, status) {
      await db.insert(schema.campParticipations).values({
        userId,
        cycle: YEAR,
        status,
        intent: INTENT_IMPLIED_BY_STATUS[status],
      });
    },
  };
}

function storeSeed(): Seed {
  return {
    side: "store",
    async user(name, options = {}) {
      return testStore.createUser({
        authUserId: `auth-${name}`,
        displayName: name,
        inviteCode: "seed",
        rank: options.rank ?? "member",
        approvalStatus: options.approval ?? "approved",
      }).id;
    },
    async join(userId, team) {
      testStore.assignTeam({ userId, team });
    },
    async lead(userId, team) {
      testStore.assignTeam({ userId, team });
      testStore.setLead({ userId, team, isLead: true });
    },
    async participation(userId, status) {
      testStore.seedParticipation({ userId, status, cycle: YEAR });
    },
  };
}

/** Tell the camp what year it is, the way setFoundingYear would. */
async function foundedAt(seed: Seed, db: DB): Promise<void> {
  const cycles = [
    { year: YEAR, startedAt: `${YEAR}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  if (seed.side === "store") {
    testStore.setTeamsConfig({
      ...testStore.getTeamsConfig(),
      cycles,
    } as ReturnType<typeof testStore.getTeamsConfig>);
    return;
  }
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

async function seedPeople(seed: Seed): Promise<People> {
  const captain = await seed.user("Cap", { rank: "captain" });
  const financeLead = await seed.user("Fin");
  await seed.lead(financeLead, Team.enum.finance);
  const kitchenLead = await seed.user("Cook");
  await seed.lead(kitchenLead, Team.enum.kitchen);
  const member = await seed.user("Nova");
  const other = await seed.user("Zed");
  return { captain, financeLead, kitchenLead, member, other };
}

/** A call's answer, or the class and sentence it threw. */
export async function outcome<T>(
  work: () => Promise<T>,
): Promise<{ ok: T } | { threw: string }> {
  try {
    return { ok: await work() };
  } catch (error) {
    const e = error as Error;
    return { threw: `${e.name}: ${e.message}` };
  }
}

const ID_KEY = /(^id$|Id$)/;
const IDS_KEY = /Ids$/;

/**
 * The answer with each side's own ids and clocks taken out: a person's id
 * becomes `@captain`, `@member`, ...; any other id (under `id`, `…Id` or
 * `…Ids`, or a string already seen as one) becomes `#1`, `#2`, ... in the
 * order it is first met; a Date becomes "<date>". So two answers are equal
 * when they say the same thing about the same rows.
 */
export function normalise(value: unknown, people: People): unknown {
  const tokens = new Map<string, string>(
    Object.entries(people).map(([name, id]) => [id, `@${name}`]),
  );
  const token = (id: string) => {
    if (!tokens.has(id)) tokens.set(id, `#${tokens.size + 1}`);
    return tokens.get(id)!;
  };
  const walk = (v: unknown, key: string): unknown => {
    if (v instanceof Date) return "<date>";
    if (typeof v === "string") {
      if (tokens.has(v)) return tokens.get(v);
      return ID_KEY.test(key) || IDS_KEY.test(key) ? token(v) : v;
    }
    if (Array.isArray(v)) return v.map((item) => walk(item, key));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, item]) => [k, walk(item, k)]),
      );
    }
    return v;
  };
  return walk(value, "");
}

/**
 * Run `scenario` with the store off (PGlite) and then on (the store), each on
 * a freshly seeded camp, and hand back both answers, normalised. Assert
 * `expect(store).toEqual(db)`, after checking `db` says what the case means.
 */
export async function bothWays<T>(
  mode: { on: boolean },
  h: Harness,
  scenario: (people: People, seed: Seed) => Promise<T>,
): Promise<{ db: unknown; store: unknown }> {
  const run = async (seed: Seed) => {
    await foundedAt(seed, h.db());
    const people = await seedPeople(seed);
    return normalise(await scenario(people, seed), people);
  };
  try {
    mode.on = false;
    testStore.reset();
    const db = await run(dbSeed(h.db()));
    mode.on = true;
    testStore.reset();
    const store = await run(storeSeed());
    return { db, store };
  } finally {
    mode.on = false;
  }
}
