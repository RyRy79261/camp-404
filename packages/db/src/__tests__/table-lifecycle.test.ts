import { describe, expect, it } from "vitest";
import { is, type Column } from "drizzle-orm";
import {
  PgTable,
  getTableConfig,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import * as schema from "../schema";
import {
  ERASURE_DECISIONS,
  TABLE_LIFECYCLE,
  type ErasureDecision,
} from "../table-lifecycle";

// The erasure half of table-lifecycle.ts. Nothing here touches a database: it
// reads the Drizzle declarations in schema.ts. A table that gains a column
// pointing at a member, with no word on what erasure does to it, fails here,
// so a new table cannot keep an erased member's data by default (POPIA).

const IDENTITY_TABLES = new Set(["users", "user"]);

/** A column referencing `users.id` or Better Auth's `user.id`, by name. */
type MemberColumn = { table: string; column: string };

/** Every column of `tables` that a foreign key points at a member with. */
function memberColumns(tables: readonly PgTable[]): MemberColumn[] {
  return tables.flatMap((table) => {
    const config = getTableConfig(table);
    return config.foreignKeys.flatMap((foreignKey) => {
      const reference = foreignKey.reference();
      const target = getTableConfig(reference.foreignTable).name;
      if (!IDENTITY_TABLES.has(target)) return [];
      return reference.columns.map((column) => ({
        table: config.name,
        column: column.name,
      }));
    });
  });
}

type Declared = { table: string; column: string; decision: ErasureDecision };

function declared(
  decisions: readonly {
    table: PgTable;
    column: Column;
    decision: ErasureDecision;
  }[],
): Declared[] {
  return decisions.map(({ table, column, decision }) => ({
    table: getTableConfig(table).name,
    column: column.name,
    decision,
  }));
}

/** The member columns with no erasure decision: what the invariant reports. */
function undeclared(
  tables: readonly PgTable[],
  decisions: readonly Declared[],
): string[] {
  const known = new Set(decisions.map((d) => `${d.table}.${d.column}`));
  return memberColumns(tables)
    .map(({ table, column }) => `${table}.${column}`)
    .filter((name) => !known.has(name))
    .sort();
}

const TABLES = Object.values(schema).filter((value) => is(value, PgTable));
const DECLARED = declared(ERASURE_DECISIONS);
const MEMBER_COLUMNS = new Set(
  memberColumns(TABLES).map(({ table, column }) => `${table}.${column}`),
);

describe("table lifecycle: one entry per table", () => {
  it("declares every table schema.ts exports, and no other", () => {
    const tableKeys = Object.entries(schema)
      .filter(([, value]) => is(value, PgTable))
      .map(([key]) => key)
      .sort();
    expect(tableKeys.length).toBeGreaterThan(30);
    expect(Object.keys(TABLE_LIFECYCLE).sort()).toEqual(tableKeys);
  });
});

describe("table lifecycle: erasure", () => {
  it("finds the member columns, so the checks below do not pass on an empty list", () => {
    expect(MEMBER_COLUMNS.size).toBeGreaterThan(100);
    expect(MEMBER_COLUMNS.has("burner_profiles.user_id")).toBe(true);
    expect(MEMBER_COLUMNS.has("session.user_id")).toBe(true);
  });

  it("has a decision for every column that references a member", () => {
    expect(undeclared(TABLES, DECLARED)).toEqual([]);
  });

  it("catches a new table that references a member with no decision", () => {
    // The invariant's own check: a table the declaration has never heard of
    // must be reported, or the test above could never fail.
    const notes = pgTable("member_scribbles", {
      id: uuid("id").primaryKey(),
      userId: uuid("user_id").references(() => schema.users.id),
      body: text("body"),
    });
    expect(undeclared([...TABLES, notes], DECLARED)).toEqual([
      "member_scribbles.user_id",
    ]);
  });

  it("names, for delete, scrub, keep and undecided, only columns that reference a member", () => {
    // The identity rows themselves (users.id, user.id) are the two scrub
    // steps that patch the stub and delete the sign-in identity.
    const stray = DECLARED.filter(
      (d) => d.decision.policy !== "cascade",
    ).filter(
      (d) =>
        !MEMBER_COLUMNS.has(`${d.table}.${d.column}`) &&
        !(IDENTITY_TABLES.has(d.table) && d.column === "id"),
    );
    expect(stray.map((d) => `${d.table}.${d.column}`)).toEqual([]);
  });

  it("names, for cascade, a foreign key that cascades from a table erasure removes rows of", () => {
    const erased = new Set(
      DECLARED.filter(
        (d) => d.decision.policy === "delete" || d.decision.policy === "scrub",
      ).map((d) => d.table),
    );
    const byName = new Map(
      TABLES.map((table) => [getTableConfig(table).name, table]),
    );
    const wrong = DECLARED.flatMap((d) => {
      if (d.decision.policy !== "cascade") return [];
      const from = d.decision.from;
      const config = getTableConfig(byName.get(d.table)!);
      const cascades = config.foreignKeys.some((foreignKey) => {
        const reference = foreignKey.reference();
        return (
          foreignKey.onDelete === "cascade" &&
          getTableConfig(reference.foreignTable).name === from &&
          reference.columns.some((column) => column.name === d.column)
        );
      });
      return cascades && erased.has(from) ? [] : [`${d.table}.${d.column}`];
    });
    expect(wrong).toEqual([]);
  });

  it("uses every scrub step at least once", () => {
    // ScrubStep and account.ts's SCRUB_STEPS agree by type; a step no column
    // names would be erasure code nobody can find from the table.
    const steps = new Set(
      DECLARED.flatMap((d) =>
        d.decision.policy === "scrub" ? [d.decision.step] : [],
      ),
    );
    expect([...steps].sort()).toEqual(
      [
        "chargeReasons",
        "claims",
        "connectorLog",
        "fuelCans",
        "liftRequestDriver",
        "paymentNotes",
        "pets",
        "refundNotes",
        "signInIdentity",
        "trailerTower",
        "usersRow",
      ].sort(),
    );
  });

  it("leaves undecided only the columns waiting on the owner", () => {
    // Pinned: a new `undecided` is a question for the owner, not a way to
    // make the invariant pass. Decide it, or add it here and say so in the PR.
    expect(
      DECLARED.filter((d) => d.decision.policy === "undecided")
        .map((d) => `${d.table}.${d.column}`)
        .sort(),
    ).toEqual([
      "meeting_note_attendees.user_id",
      "task_deadline_reminders.user_id",
    ]);
  });
});
