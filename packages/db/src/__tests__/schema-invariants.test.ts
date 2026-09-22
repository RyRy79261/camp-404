import { describe, expect, it } from "vitest";
import { Column, SQL, StringChunk, getTableColumns, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { MEMBER_FIELD_READERS } from "@camp404/core";
import { neonAuthUsers } from "../neon-auth";
import * as schema from "../schema";

// The rules a careless column or index change can break without any other test
// noticing. Nothing here touches a database: it reads the Drizzle declarations
// in schema.ts, which are what the migrations are generated from.

const TABLES = Object.values(schema).filter((value) => is(value, PgTable));
const configs = TABLES.map((table) => getTableConfig(table));
const byName = new Map(configs.map((config) => [config.name, config]));

/** A partial index's predicate as flat text, e.g. `status = 'sent'`. */
function predicateText(predicate: SQL | undefined): string {
  if (!predicate) return "";
  let text = "";
  const walk = (chunk: unknown): void => {
    if (is(chunk, SQL)) {
      for (const inner of chunk.queryChunks) walk(inner);
      return;
    }
    if (is(chunk, StringChunk)) text += chunk.value.join("");
    else if (is(chunk, Column)) text += chunk.name;
  };
  walk(predicate);
  return text.replace(/\s+/g, " ").trim();
}

describe("the schema is enumerable", () => {
  it("exports the tables this file sweeps", () => {
    // Every assertion below loops over TABLES, and a loop over an empty list
    // passes silently.
    expect(TABLES.length).toBeGreaterThan(30);
    expect(byName.has("burner_profiles")).toBe(true);
    expect(byName.has("questionnaire_responses")).toBe(true);
  });
});

describe("encrypted columns", () => {
  // Pinned on purpose. crypto.ts encrypts exactly these. A new `*_encrypted`
  // column that is not wired through encrypt/decryptField passes lint,
  // typecheck, build and every other test, and shows up only as plaintext
  // personal data in production.
  const ENCRYPTED_COLUMNS = [
    "users.eft_details_encrypted",
    "users.passport_encrypted",
    "users.sa_id_encrypted",
    "reimbursements.account_details_encrypted",
  ];

  const found = configs.flatMap((config) =>
    config.columns
      .filter((column) => column.name.endsWith("_encrypted"))
      .map((column) => ({ table: config.name, column })),
  );

  it("are exactly the set crypto.ts knows how to read", () => {
    expect(found.map((f) => `${f.table}.${f.column.name}`).sort()).toEqual(
      [...ENCRYPTED_COLUMNS].sort(),
    );
  });

  it("are text", () => {
    for (const { table, column } of found) {
      expect(`${table}.${column.name} ${column.columnType}`).toBe(
        `${table}.${column.name} PgText`,
      );
    }
  });

  it("are nullable on users, so an erased or unreadable ID is stored as absent", () => {
    // reimbursements.account_details_encrypted is the one NOT NULL exception:
    // the reimbursement record is kept for accounting, so erasure scrubs it to
    // "" (sanitiseAccount in account.ts) instead of nulling it.
    for (const { table, column } of found) {
      const expected = table === "reimbursements" ? "true" : "false";
      expect(`${table}.${column.name} notNull=${column.notNull}`).toBe(
        `${table}.${column.name} notNull=${expected}`,
      );
    }
  });

  it("have no plaintext sibling column", () => {
    for (const { table, column } of found) {
      const plaintext = column.name.replace(/_encrypted$/, "");
      const names = byName.get(table)?.columns.map((c) => c.name) ?? [];
      expect(
        `${table}: ${names.includes(plaintext) ? plaintext : "none"}`,
      ).toBe(`${table}: none`);
    }
  });
});

describe("partial unique and queue indexes keep their predicates", () => {
  // Postgres matches ON CONFLICT against a partial index only when the
  // statement repeats the predicate, and a queue index without its predicate
  // stops serving the drain query. The predicate is half the contract.
  const PARTIAL_INDEXES: Record<string, { columns: string[]; where: string }> =
    {
      captain_promotion_open_per_target_idx: {
        columns: ["target_user_id"],
        where: "status = 'sent'",
      },
      questionnaire_activations_one_open_per_key_idx: {
        columns: ["questionnaire_key"],
        where: "status = 'open'",
      },
      notification_deliveries_email_queue_idx: {
        columns: ["created_at"],
        where: "email_status = 'queued'",
      },
      notification_deliveries_broadcast_user_uniq: {
        columns: ["broadcast_id", "user_id"],
        where: "broadcast_id IS NOT NULL",
      },
      users_ref_code_uniq: {
        columns: ["ref_code"],
        where: "ref_code IS NOT NULL",
      },
      // The console banner's read: "the announcements that are pinned", on
      // every console page load. The PREDICATE is what earns this index — the
      // pinned rows are a handful out of the whole broadcast table. It is NOT
      // unique: any number of announcements may be pinned at once, and the
      // owner ruled the banner carries all of them.
      broadcasts_pinned_idx: {
        columns: ["published_at"],
        where: "pinned_at is not null",
      },
    };

  const partial = configs.flatMap((config) =>
    config.indexes
      .map(
        (index) =>
          (
            index as unknown as {
              config: {
                name: string;
                columns: { name: string }[];
                where?: SQL;
              };
            }
          ).config,
      )
      .filter((index) => index.where !== undefined),
  );

  it("are exactly the known set, each on its columns with its predicate", () => {
    expect(
      Object.fromEntries(
        partial.map((index) => [
          index.name,
          {
            columns: index.columns.map((c) => c.name),
            where: predicateText(index.where),
          },
        ]),
      ),
    ).toEqual(PARTIAL_INDEXES);
  });
});

describe("self-consistency across every exported table", () => {
  it("names every table in snake_case, with no duplicates", () => {
    const names = configs.map((config) => config.name);
    expect(names.filter((name) => !/^[a-z][a-z0-9_]*$/.test(name))).toEqual([]);
    expect(names.length).toBe(new Set(names).size);
  });

  it("names every column in snake_case", () => {
    const bad = configs.flatMap((config) =>
      config.columns
        .filter((column) => !/^[a-z][a-z0-9_]*$/.test(column.name))
        .map((column) => `${config.name}.${column.name}`),
    );
    expect(bad).toEqual([]);
  });

  it("points every foreign key at a table this module exports", () => {
    // A dangling reference is a migration that will not apply, found at
    // deploy time against production.
    const known = new Set(configs.map((config) => config.name));
    const dangling: string[] = [];
    for (const config of configs) {
      for (const foreignKey of config.foreignKeys) {
        const target = getTableConfig(foreignKey.reference().foreignTable).name;
        if (!known.has(target)) dangling.push(`${config.name} -> ${target}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});

describe("every member-data column has a reader in the field-access list", () => {
  // MEMBER_FIELD_READERS (@camp404/core privacy.ts) names the lowest rank that
  // may read each piece of member data about someone else. A column added to
  // one of these tables without an entry fails here, so it cannot reach a
  // roster, an MCP tool or an export unclassified.
  const MEMBER_TABLES = {
    users: schema.users,
    burnerProfiles: schema.burnerProfiles,
    dietaryRequirements: schema.dietaryRequirements,
    driverProfiles: schema.driverProfiles,
    carMembers: schema.carMembers,
    teamMemberships: schema.teamMemberships,
    payments: schema.payments,
    // Not in schema.ts (Neon Auth owns it), but it holds member email.
    neonAuthUsers,
  };

  const columns = Object.entries(MEMBER_TABLES).flatMap(([table, t]) =>
    Object.keys(getTableColumns(t)).map((property) => `${table}.${property}`),
  );

  it("lists every column of every member-data table", () => {
    expect(columns.filter((field) => !(field in MEMBER_FIELD_READERS))).toEqual(
      [],
    );
  });

  it("lists no column that does not exist", () => {
    const known = new Set(columns);
    expect(
      Object.keys(MEMBER_FIELD_READERS).filter((field) => !known.has(field)),
    ).toEqual([]);
  });
});
