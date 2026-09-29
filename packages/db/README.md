# @camp404/db

The Drizzle schema, the generated migrations and every query the apps run
against Neon Postgres.

- **Exports:** the drivers from `@camp404/db` (`createHttpDb`, stateless and
  without transactions; `createPooledDb` and `withTransaction` for atomic
  work), the schema at `@camp404/db/schema`, and one subpath per feature,
  for example `@camp404/db/broadcasts`, `/participations`, `/tickets`,
  `/dues`, `/payments`, `/team-memberships`, `/team-programs`, `/transport`,
  `/power`, `/power-site`, `/power-grid`, `/power-readiness`, `/inventory`,
  `/lounge`, `/camp-layout` and `/meal-plan`. The full list is `exports` in
  `package.json`.
- **Depends on:** `@camp404/core`, `@camp404/types`.
- **Imported by:** server code only: `apps/web`, `apps/join` (the join site
  reads `@camp404/db/join-site`), `apps/admin-cli`, `@camp404/auth`,
  `@camp404/telegram`. Never from a client component.

`src/schema.ts` is the one hand-written source. Everything in `migrations/` is
generated; never edit it by hand. Read the database section of
[`AGENTS.md`](../../AGENTS.md#database--read-this-before-touching-the-schema)
before you change the schema.

```bash
pnpm --filter @camp404/db db:generate   # a new migration from schema.ts
pnpm --filter @camp404/db db:migrate    # apply migrations to DATABASE_URL
pnpm --filter @camp404/db test          # real queries on PGlite, no Docker
```

The tests run every driver on one in-process Postgres
(`src/__tests__/_harness.ts`), so a query outside an open transaction waits
forever. Pass the `tx` down instead.
