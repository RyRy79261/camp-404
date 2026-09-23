import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import * as schema from "../schema";

// Migration 0038 moves every sign-in identity out of Neon Auth's schema into
// the self-hosted Better Auth tables. The property that matters: a member's
// login keeps its id, so users.auth_user_id still finds them, and their
// password hash comes with it. Each case builds neon_auth the way Neon does
// (uuid ids, camelCase columns) and runs the migration's SQL again.

type H = ReturnType<typeof useTestDb>;
type DB = ReturnType<H["db"]>;

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../migrations/0038_copy_neon_auth_identities.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const ADA = "0b7f3c2e-1d4a-4e6b-9c8d-7a6f5e4d3c21";
const BO = "5e1d2c3b-4a59-4687-8f6e-5d4c3b2a1908";
const NO_EMAIL = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

/** Neon Auth's tables, as Neon lays them out. */
async function neonAuthLikeNeon(h: H) {
  await h.client().exec(`
    drop schema if exists neon_auth cascade;
    create schema neon_auth;
    create table neon_auth."user" (
      id uuid primary key,
      name text not null,
      email text,
      "emailVerified" boolean not null default false,
      image text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      role text,
      banned boolean
    );
    create table neon_auth.account (
      id uuid primary key,
      "accountId" text not null,
      "providerId" text not null,
      "userId" uuid not null references neon_auth."user"(id),
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      scope text,
      password text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    );
  `);
  await h.client().query(
    `insert into neon_auth."user" (id, name, email, "emailVerified", image, "createdAt") values
       ($1, 'Ada', 'Ada@Example.com', true, 'https://img/ada', '2026-03-01T10:00:00Z'),
       ($2, '', 'bo@example.com', false, null, '2026-04-01T10:00:00Z'),
       ($3, 'Ghost', null, false, null, '2026-05-01T10:00:00Z')`,
    [ADA, BO, NO_EMAIL],
  );
  await h.client().query(
    `insert into neon_auth.account (id, "accountId", "providerId", "userId", "accessToken", password) values
       ('11111111-1111-4111-8111-111111111111', $1::text, 'credential', $1::uuid, null, 'salt:hash-ada'),
       ('22222222-2222-4222-8222-222222222222', 'google-sub-ada', 'google', $1::uuid, 'neon-token', null),
       ('33333333-3333-4333-8333-333333333333', 'google-sub-ghost', 'google', $2::uuid, 'neon-token', null)`,
    [ADA, NO_EMAIL],
  );
}

async function runMigration(db: DB) {
  await db.execute(sql.raw(migration));
}

describe("migration 0038: copy sign-in identities out of neon_auth", () => {
  const h = useTestDb();

  it("keeps each login's id, so the camp member it belongs to still finds it", async () => {
    const db = h.db();
    await neonAuthLikeNeon(h);
    const member = await makeUser(db, { authUserId: ADA });

    await runMigration(db);

    const [identity] = await db
      .select({
        email: schema.user.email,
        name: schema.user.name,
        verified: schema.user.emailVerified,
        image: schema.user.image,
      })
      .from(schema.users)
      .innerJoin(schema.user, eq(schema.user.id, schema.users.authUserId))
      .where(eq(schema.users.id, member.id));
    // Lower-cased, because Better Auth looks an email up lower-cased.
    expect(identity).toEqual({
      email: "ada@example.com",
      name: "Ada",
      verified: true,
      image: "https://img/ada",
    });
  });

  it("brings the password hash and the Google id, never Neon's tokens", async () => {
    const db = h.db();
    await neonAuthLikeNeon(h);
    await runMigration(db);

    const accounts = await db
      .select({
        providerId: schema.account.providerId,
        accountId: schema.account.accountId,
        userId: schema.account.userId,
        password: schema.account.password,
        accessToken: schema.account.accessToken,
      })
      .from(schema.account)
      .orderBy(schema.account.providerId);
    expect(accounts).toEqual([
      {
        providerId: "credential",
        accountId: ADA,
        userId: ADA,
        password: "salt:hash-ada",
        accessToken: null,
      },
      {
        providerId: "google",
        accountId: "google-sub-ada",
        userId: ADA,
        password: null,
        accessToken: null,
      },
    ]);
  });

  it("skips a login with no email, and its sign-in methods with it", async () => {
    const db = h.db();
    await neonAuthLikeNeon(h);
    await runMigration(db);

    const users = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .orderBy(schema.user.email);
    // Bo had an empty name: the email stands in, as sign-up does.
    expect(users).toEqual([
      { id: ADA, name: "Ada" },
      { id: BO, name: "bo@example.com" },
    ]);
    expect(
      await db
        .select()
        .from(schema.account)
        .where(eq(schema.account.userId, NO_EMAIL)),
    ).toEqual([]);
  });

  it("changes nothing when it runs again", async () => {
    const db = h.db();
    await neonAuthLikeNeon(h);
    await runMigration(db);
    await db
      .update(schema.user)
      .set({ name: "Ada Lovelace" })
      .where(eq(schema.user.id, ADA));

    await runMigration(db);

    expect(await db.select().from(schema.user)).toHaveLength(2);
    expect(await db.select().from(schema.account)).toHaveLength(2);
    const [ada] = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, ADA));
    expect(ada!.name).toBe("Ada Lovelace");
  });

  it("copies what it can from a thinner neon_auth, and nothing when there is none", async () => {
    const db = h.db();
    // The shape the local stack used to stub: three columns, no account table.
    await h.client().exec(`
      drop schema if exists neon_auth cascade;
      create schema neon_auth;
      create table neon_auth."user" (id text primary key, email text, "emailVerified" boolean);
      insert into neon_auth."user" values ('local-1', 'cy@example.com', null);
    `);
    await runMigration(db);
    expect(
      await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          verified: schema.user.emailVerified,
        })
        .from(schema.user),
    ).toEqual([{ id: "local-1", name: "cy@example.com", verified: false }]);

    await h.client().exec(`drop schema neon_auth cascade;`);
    await db.delete(schema.user);
    await runMigration(db);
    expect(await db.select().from(schema.user)).toEqual([]);
  });
});
