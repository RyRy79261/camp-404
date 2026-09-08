# Unit 13 — Database layer: schema conventions, migrations, rate limiting, seeding, local proxy

**Donor:** `quagga-portal` / AfrikaBurn Contributors App
**Donor root (this machine):** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Subsystem root:** `packages/db/` (+ `docker-compose.local.yml`, `scripts/e2e-local.sh`, `turbo.json`, and two org-app consumers)
**Harvest date:** 2026-09-08. Every claim below cites `path:line` against the donor tree as checked out.

---

## 0. Purpose — why this unit matters to Camp 404

Camp 404 and the donor are two forks of the same scaffold. `packages/db/drizzle.config.ts` is **byte-identical** across the two repos, both run `drizzle-orm ^0.45.2` + `drizzle-kit ^0.31.10` against Neon, and both hand-author one `src/schema.ts` with generated SQL under `migrations/`. So nothing in this unit is a *port* in the hard sense — it is a scope rename plus a decision about which of the donor's operational hardening you want.

What the donor has that Camp 404 does **not**, in descending order of value:

1. **A deploy-time migration runner with a Postgres session advisory lock** (`packages/db/src/migrate.ts`, 280 lines) and a **pure, unit-testable planner** split out of it (`packages/db/src/migration-plan.ts`, 124 lines). Camp 404's `apps/web` `vercel-build` calls `drizzle-kit migrate` directly: no lock, no unpooled enforcement, no bootstrap-seed hook, no way to ask "would this deploy migrate safely?" without running it.
2. **A DB-backed fixed-window rate limiter** with its own table (`action_rate_limit`), one atomic statement, a data-modifying-CTE sweep, and a documented fail-open (`packages/db/src/rate-limit.ts`, 153 lines). Camp 404 has **no** rate limiter anywhere — `packages/core/src/index.ts:26-28` explicitly notes `rateLimit` is *not* in core, and the donor's own `docs/superpowers/specs/2026-05-31-shake-to-report-design.md`-equivalent follow-up in Camp 404 ("a shared Upstash-backed rate limiter to replace the per-instance in-memory one") is an open item. This table is the drop-in that closes it *without a new dependency*.
3. **A local Postgres stack that both Neon drivers can actually talk to** (`docker-compose.local.yml` + `packages/db/src/local-proxy.ts`, 36 lines). Camp 404 has neither, and its `README.md` assumes a cloud Neon branch. This is the difference between "the DB integration tests run" (Camp 404 already has PGlite for that) and "the whole app runs offline end-to-end".
4. **A seeding law and an idempotency discipline** (`packages/db/src/seed.ts`, 756 lines) whose header comment is a binding product decision — *no seeded accounts, ever, in any environment* — and whose helpers are each annotated with the exact live-data incident that forced insert-if-missing over upsert.
5. **A test harness for query-shaped code that has no database**: `packages/db/src/__tests__/support/fake-db.ts` (224 lines), a recording drizzle stand-in that captures op kind, table, projection, where-column, values, `.set()` patch, conflict target and conflict action. Camp 404's PGlite harness answers a *different* question (does this SQL run?); this one answers "did the code issue the right statement, on the right column, with the right conflict semantics?" — and it costs no Postgres. **They compose; take both.**
6. **`schema-invariants.test.ts`** (191 lines) — a sweep over every exported `PgTable` asserting things a migration can silently break: which columns are encrypted, that no encrypted column has a plaintext sibling, that every FK points at an exported table, snake_case naming, no duplicate table names.

What is **not** worth taking: the schema itself (44 tables, all group/edition-scoped), the Better Auth identity tables, the org-roles layer, and the supplier catalogue. Those are covered in §9.

---

## 1. File inventory

### `packages/db/src/` — 3,862 lines total

| File | Lines | What it is | Camp 404 verdict |
|---|---:|---|---|
| `schema.ts` | 2045 | 44 `pgTable`, 28 `pgEnum`. Hand-authored, single source of truth. | concept-only (see §9) |
| `seed.ts` | 756 | Idempotent reference-data seed + two exported repair helpers. | pattern + light-adapt |
| `migrate.ts` | 280 | Deploy-time advisory-locked runner + bootstrap/repair branch. | light-adapt (high value) |
| `deletion.ts` | 204 | `cancelPendingDeletion` — sign-in cancels a pending account deletion. | light-adapt |
| `rate-limit.ts` | 153 | `consumeRateLimit` + `rateLimitIp`, fixed-window counters. | **drop-in** |
| `index.ts` | 151 | `createHttpDb` / `createPooledDb`, driver switch, SQL logger, barrel. | light-adapt |
| `migration-plan.ts` | 124 | Pure `planMigration` / `isPoolerConnection` / `connectionHost`. | **drop-in** |
| `crypto.ts` | 113 | AES-256-GCM `encrypt`/`decrypt`/`decryptOrNull`/`decryptField`. | light-adapt (Camp 404 has its own) |
| `local-proxy.ts` | 36 | `configureLocalProxy()` — points both Neon drivers at local proxies. | **drop-in** |

### `packages/db/src/__tests__/` — 11 test files + 1 support module

| File | Bytes | Covers |
|---|---:|---|
| `support/fake-db.ts` | 5,468-equivalent (224 lines) | the recording drizzle stand-in |
| `deletion.test.ts` | 15,596 | 22 cases across 5 describes — id-space resolution, grace, concurrency guard, courtesy rows, never-break-sign-in |
| `migrate-runner.test.ts` | 10,688 | order/branch of `runDeployMigrations` with pool+migrator+seed mocked |
| `rate-limit.test.ts` | 7,655 | verdict logic, both driver result shapes, fail-open, one-statement claim |
| `seed-org-bootstrap.test.ts` | 7,480 | insert-if-missing semantics of the two repair helpers |
| `schema-invariants.test.ts` | 7,459 | encrypted-column set, partial unique indexes, FK sweep, naming |
| `crypto.test.ts` | 5,038 | round-trip, fresh IV, tri-state `decryptField`, key-rotation, no-log-on-failure, key guard |
| `migrate.test.ts` | 5,038 | the pure planner's 12 env permutations |
| `local-proxy.test.ts` | 4,735 | the opt-in gate, both endpoints, independent ports, TLS off |
| `db-drivers.test.ts` | 8,040 | env-less construction, transport switch, pool reuse, pool error swallow, SQL logger |
| `questionnaire-upsert-target.test.ts` | 3,614 | a **source-text** assertion that every `onConflictDoUpdate` on `questionnaire_responses` passes `targetWhere` |
| `form-2-template.test.ts` | 3,638 | a **source-text** assertion that seeded question ids match a mirror map in another package |

### Adjacent files that belong to this unit

| Path | Lines | Role |
|---|---:|---|
| `docker-compose.local.yml` | 71 | Postgres 16 + **two** Neon proxies (ws + http) |
| `packages/db/drizzle.config.ts` | 11 | byte-identical to Camp 404's |
| `packages/db/vitest.config.ts` | 65 | coverage thresholds + the schema.ts exclusion rationale |
| `packages/db/package.json` | 44 | 3 exports, 5 db scripts |
| `packages/db/migrations/` | 29 `.sql` + `meta/` | append-only, journal v7 |
| `scripts/e2e-local.sh` | 245 | the full local stack runner (migrate → seed → god bootstrap → serve → playwright) |
| `apps/org/lib/system-status.ts` | 746 | pure `/system` deriver — consumes `planMigration` + `connectionHost` |
| `apps/org/lib/system-probe.ts` | 94 | the server half: one timed `select 1`, 5 s timeout, never throws |
| `apps/web/lib/db.ts` | 51 | per-app handle: `db()`, `withTransaction`, `Tx` type, `requireDb()` |
| `apps/web/app/api/account/deletion-sweep/route.ts` | 149 | cron-triggered destructive job with timing-safe dual-secret auth |

---

## 2. Capability list (exhaustive, each cited)

### Drivers and connection management
1. **Two drivers, deliberately** — `createHttpDb(): Database` (stateless neon-http, no transactions) and `createPooledDb(): PooledDatabase` (WebSocket pool, transactions) — `packages/db/src/index.ts:86`, `:146`. Identical split to Camp 404 (`AGENTS.md:70-75`).
2. **Env-less construction is guaranteed.** `requireDatabaseUrl()` falls back to `BUILD_PLACEHOLDER_URL = "postgres://build:build@localhost:5432/build?sslmode=disable"` (`index.ts:43-48`) so a factory call during `next build`'s page-data collection never throws; only a real query fails. Asserted at `__tests__/db-drivers.test.ts:77-92`.
3. **A transport switch for local/CI.** Under `NEON_LOCAL_PROXY=1`, `createHttpDb()` returns a `drizzleServerless` handle over a shared WebSocket pool instead of the HTTP driver (`index.ts:88-99`). Measured justification in the docstring: `select 1` × 20 sequentially — **SQL-over-HTTP 3041 ms (152 ms/statement) vs WebSocket 41 ms (2 ms/statement)** (`index.ts:56-58`). The camp dashboard issues ~20 statements → cold 7.9 s, warm 4.0 s; **all 37 navigation timeouts across the whole e2e fleet on 28 Jul were one page or its child, and nothing else timed out** (`index.ts:69-75`).
4. **The local read pool is process-wide and created once** — `let localReadPool: Pool | undefined` (`index.ts:105`), `max: 10, allowExitOnIdle: true` (`index.ts:109-111`). Pinned at `db-drivers.test.ts:120-129`.
5. **A pool `error` handler that refuses to kill the process** — `pool.on("error", …)` logs `[db] local read pool client error (ignored):` (`index.ts:116-118`). Rationale: an unhandled `'error'` on an idle pooled client takes the process down, and this pool is process-wide. Pinned at `db-drivers.test.ts:131-150`.
6. **Opt-in per-statement SQL logging** — `sqlLogger()` returns undefined unless `QUAGGA_SQL_LOG === "1"`; prints `[sql] ` + whitespace-collapsed query truncated to **160 chars** (`index.ts:132-140`). Greppable on purpose (`grep -c '\[sql\]'`). Pinned at `db-drivers.test.ts:165-185`, which asserts the line length is exactly `"[sql] ".length + 160`.

### Local development proxy
7. **`configureLocalProxy()` is a hard `=== "1"` gate.** `if (process.env.NEON_LOCAL_PROXY !== "1") return;` (`local-proxy.ts:27`). A truthy check would re-point a deployed app at localhost the moment the var existed with *any* value — `local-proxy.test.ts:50-62` iterates `[undefined, "0", "true", "yes", "", "01"]` and asserts `neonConfig` is untouched for all six.
8. **Two endpoints, independently configurable.** `NEON_LOCAL_PROXY_HOST` (default `"localhost"`), `NEON_LOCAL_WS_PORT` (default `"5433"`), `NEON_LOCAL_HTTP_PORT` (default `"4444"`) → `neonConfig.wsProxy = () => \`${host}:${wsPort}/v1\`` and `neonConfig.fetchEndpoint = () => \`http://${host}:${httpPort}/sql\`` (`local-proxy.ts:28-33`).
9. **TLS and pipelining are turned off**: `neonConfig.useSecureWebSocket = false` and `neonConfig.pipelineConnect = false` (`local-proxy.ts:31`, `:35`) — the proxies terminate TLS themselves.
10. **The proxy address is deliberately independent of `DATABASE_URL`'s host.** The connection-string host is resolved *by the proxy* inside the compose network (`postgres`); the proxy endpoint is resolved *by this process* on the host (`localhost`). "There is no single hostname that satisfies both" (`local-proxy.ts:6-14`). Pinned at `local-proxy.test.ts:92-104`.
11. **One definition shared by `index.ts` and `migrate.ts`.** The module exists because two copies drifted: the migrator and the pooled driver were configured while the HTTP driver was not, "which made a local run impossible in a way nothing reported" (`local-proxy.ts:21-24`).

### Deploy-time migration
12. **`planMigration(env)` is pure and throws for unsafe configurations** — `migration-plan.ts:63`. Returns `{kind:"skip", reason}` or `{kind:"run", connectionString, usingUnpooled}`.
13. **Pooler detection**: `-pooler.` host suffix, `pgbouncer` in the host, or `?pgbouncer=true` (`migration-plan.ts:32-42`).
14. **Three hard refusals** (§4 for verbatim messages): production with no DB at all; any pooled endpoint in any env; any Vercel deploy (preview included) without `DATABASE_URL_UNPOOLED`.
15. **`NEON_LOCAL_PROXY=1` exempts both pooler guards** (`migration-plan.ts:89`) because Neon Local reroutes to a single local backend.
16. **A fixed advisory-lock key**, `MIGRATION_ADVISORY_LOCK_KEY = 42_97_2027` (`migrate.ts:82`). Identity across all three apps and every deploy is what serialises the concurrent builders. Pinned at `migrate-runner.test.ts:173-179`, which asserts the lock and unlock args are equal and that the value is `42_97_2027`.
17. **The lock is taken on ONE checked-out client, and the migrator runs on that same client** — `const client = await pool.connect()` (`migrate.ts:152`), then `drizzle(client)` and `migrate(db, {migrationsFolder})` (`migrate.ts:172-177`). "A lock taken on a different connection than the migration protects nothing." Pinned at `migrate-runner.test.ts:146-160`.
18. **Bounded wait, unbounded migration.** `SET lock_timeout = 120000` **and** `SET statement_timeout = 120000` before the lock, then `SET statement_timeout = 0` after it is held (`migrate.ts:156-169`). `LOCK_TIMEOUT_MS = 120_000` (`migrate.ts:98`). Ordering pinned at `migrate-runner.test.ts:162-171`.
19. **Bootstrap-on-first-deploy**: `SELECT 1 FROM editions LIMIT 1`; when `rowCount === 0`, dynamically `import("./seed")` and run `seedReferenceData` **inside an explicit `BEGIN`/`COMMIT`/`ROLLBACK`** on the locked connection (`migrate.ts:195-225`).
20. **Bootstrap, not sync.** When an edition exists it does **not** re-seed; it only runs two insert-if-missing repair helpers, `ensureSeededOrgDepartments` and `ensureSeededOrgRoles`, and logs the count restored (`migrate.ts:226-251`).
21. **Explicit cleanup in `finally`**: unlock (swallowing an unlock error with a warning), `client.release()`, `pool.end()` (`migrate.ts:252-266`). Pinned at `migrate-runner.test.ts:181-207`.
22. **Runs only when invoked directly** — `import.meta.url === pathToFileURL(process.argv[1]).href` (`migrate.ts:271-273`). The same guard is in `seed.ts:747-749`, where a bare top-level `main()` once meant merely *importing* the module re-seeded a live database.
23. **Wired into every app's build**: `"build": "pnpm --filter @quagga/db db:migrate:deploy && next build"` in `apps/web/package.json:8`, `apps/org/package.json:8`, `apps/suppliers/package.json:8`; same string for `vercel-build` at each `:9`.
24. **Turbo marks all four db tasks `cache: false`** — `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:seed` (`turbo.json:66-77`).

### Rate limiting
25. **`consumeRateLimit({key, max, windowSeconds, now?}) → Promise<RateLimitVerdict>`** — one fixed window, one statement (`rate-limit.ts:82`).
26. **Its own table, `action_rate_limit`, PK on `key`** — deliberately *not* a namespace inside Better Auth's `rate_limit` (schema rationale at `schema.ts:470-490`, code rationale at `rate-limit.ts:13-35`).
27. **A data-modifying CTE sweeps stale rows in the same statement**, excluding this call's own key (`rate-limit.ts:107-111`). `STALE_ROW_HORIZON_MS = 24 * 60 * 60 * 1000` (`rate-limit.ts:70`) — "generous by roughly two orders of magnitude on purpose" against a 15-minute longest window, because the sweep runs with the caller's clock and knows nothing about other callers' windows.
28. **Fixed, not rolling**: `window_start` moves only when the window has elapsed (`rate-limit.ts:114-122`).
29. **Handles both driver result shapes** — bare array (neon-http) and `{rows}` (neon-serverless): `const row = Array.isArray(rows) ? rows[0] : rows.rows?.[0]` (`rate-limit.ts:126`). Pinned at `rate-limit.test.ts:136-159`.
30. **Fails open, loudly** — `catch { console.error("[rate-limit] storage failure, allowing request", err); return ALLOWED; }` (`rate-limit.ts:137-140`), and returns `ALLOWED` with no driver call when `DATABASE_URL` is unset (`rate-limit.ts:90`).
31. **`retryAfterSeconds` is floored at 1** — `Math.max(1, Math.ceil((windowEndsAt - nowMs) / 1000))` (`rate-limit.ts:135`); a 0 would tell the client to hot-loop the endpoint being protected.
32. **`rateLimitIp(headers)`** takes the **first** `x-forwarded-for` entry trimmed, falls back to `x-real-ip`, then the literal string `"unknown"` (`rate-limit.ts:148-153`). The literal matters: an empty key would give every unattributable caller its own bucket (`rate-limit.test.ts:62-70`).
33. **Shared budget constants**: `FORGOT_PASSWORD_MAX_PER_WINDOW = 3`, `FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60` (`rate-limit.ts:46-47`), exported from the barrel (`index.ts:17-23`) and consumed by all three apps' password actions plus the in-app report and transcribe routes (§6).

### Seeding
34. **`seedReferenceData(db)`** — edition → org group → org roles → org departments → camp categories → two questionnaire templates → supplier catalogue (`seed.ts:230-482`).
35. **`ensureSeededOrgRoles(db): Promise<number>`** — insert-if-missing on `key`, returns rows actually inserted (`seed.ts:136-147`).
36. **`ensureSeededOrgDepartments(db): Promise<number>`** — insert-if-missing, files domains **only for a department this call just created** (`seed.ts:205-212`), always ensures the lead/member role pair (`seed.ts:216-225`).
37. **Committed JSON snapshot, validated by Zod at the seed boundary** — `import suppliersDataRaw from "./data/suppliers.json" with { type: "json" }` then `.map((row) => SupplierImportRow.parse(row))` (`seed.ts:73-83`). The snapshot carries `source`, `sourceUrl`, `importedAt` and a `note` recording exactly what was scrubbed at parse time (`packages/db/src/data/suppliers.json:1-6`).
38. **`firstOrThrow(rows, what)`** — every write is a single-row upsert, so an empty `.returning()` is a hard error (`seed.ts:87-91`).
39. **A local `slugify` with a uniqueness loop** (`seed.ts:96-105`, `:532-545`) — kept in-script because apps/web's slugify is a `server-only` module.
40. **Guarded `main()`** — `if (!process.env.DATABASE_URL) { console.error(…); process.exitCode = 1; return; }` (`seed.ts:485-491`), pool always ended in `finally` (`seed.ts:496-498`).

### Encryption at rest
41. **AES-256-GCM over Node's `node:crypto`, not the pgcrypto extension** — `ALGO = "aes-256-gcm"`, `IV_LEN = 12`, `TAG_LEN = 16`, `KEY_SALT = "quagga-pgcrypto-v1"`, key derived by `scryptSync(raw, KEY_SALT, 32)` and cached at module scope (`crypto.ts:22-39`).
42. **Stored format `base64(iv ‖ tag ‖ ciphertext)`** (`crypto.ts:18`, `:49`), with a length guard `buf.length < IV_LEN + TAG_LEN + 1 → "Ciphertext is too short to be valid."` (`crypto.ts:54-56`).
43. **Key guard**: `PGCRYPTO_KEY` must exist and be **≥ 16 characters**, else `"PGCRYPTO_KEY env var is required and must be at least 16 characters."` (`crypto.ts:31-36`). Boundary pinned at 15 vs 16 in `crypto.test.ts:127-133`.
44. **THE tri-state read — `DecryptedField`.** `{state:"empty"|"ok"|"unreadable"}` (`crypto.ts:95-98`), and `decryptField()` (`crypto.ts:103-113`) alongside the older `decryptOrNull()` (`crypto.ts:76-85`). The docstring states the whole reason: `null` on a medical column renders as the affirmative "no medical notes on file" — a reassurance a failed decrypt must never produce (`crypto.ts:68-75`, `:87-94`). The failure branch is deliberately silent — `crypto.test.ts:96-105` asserts nothing is written to `console.log/warn/error`.

### Account deletion (auth-adjacent, provider-agnostic)
45. **`cancelPendingDeletion(input)`** lives in `@quagga/db` specifically so the Better Auth session-create hook *and* an explicit Cancel button share one implementation (`deletion.ts:3-9`).
46. **Two id spaces, explicitly.** `userId?` is *our* `users.id` (uuid); `authUserId?` is the provider's text id that a session carries. The docstring records that passing `session.userId` straight in as `userId` made Postgres refuse to compare uuid to text, the catch swallowed it, and the function returned "nothing to cancel" on **every** sign-in — while a unit test asserting only "the hook is wired" stayed green (`deletion.ts:45-62`).
47. **The concurrency guard is the UPDATE's own WHERE**: `.where(and(eq(id, request.id), eq(status, "pending")))` inside a transaction that also writes the audit row (`deletion.ts:118-139`). Two simultaneous sign-ins cannot double-cancel.
48. **Courtesy rows are best-effort and never roll the cancel back** — notification insert and `security_events` insert each in their own `try {} catch {}` (`deletion.ts:154-195`).
49. **Never throws.** The outer catch logs `[deletion] sign-in cancellation failed` and returns `NOT_CANCELLED` (`deletion.ts:198-203`).

### Test harness
50. **`createFakeDb(handler)` → `{db, ops, transactions, opsOn(table, kind?)}`** (`__tests__/support/fake-db.ts:108`). A thenable builder chain records `kind, table, inTransaction, projection, values, set, where, ordered, limit, returning, conflictTarget, conflictAction` (`fake-db.ts:58-77`).
51. **`whereFilters(node)`** walks a drizzle `SQL` predicate and extracts `{column, value}` pairs by `is(chunk, Column)` / `is(chunk, Param)` (`fake-db.ts:36-55`). The docstring names why the *column* is load-bearing: audit B1 was a predicate on the wrong column, and no assertion about a rendered SQL string would have said so clearly.
52. **The harness states its own limits** — "WHAT IT IS NOT: proof that any statement here is valid SQL. It cannot be." (`fake-db.ts:10-14`).
53. **Two source-text assertions** — `questionnaire-upsert-target.test.ts` brace-counts every `.onConflictDoUpdate(` block in three files across two apps and fails if one touching `questionnaireResponses` lacks `targetWhere`; `form-2-template.test.ts` reads `seed.ts` as text (because importing it would open a connection) and diffs the seeded question ids against a map in another package.
54. **`schema-invariants.test.ts`** sweeps `Object.values(schema).filter(v => is(v, PgTable))` and asserts: the sweep is non-vacuous (`>30` tables, `:41`); encrypted columns are exactly `["sa_id_encrypted","passport_encrypted"]` (`:52`); they are `PgText` and nullable (`:66-75`); **no encrypted column has a plaintext sibling** (`:77-88`); the two partial unique indexes carry their predicates (`:109-141`); every table name matches `/^[a-z][a-z0-9_]*$/` with no duplicates (`:169-175`); **no foreign key points at a table this module does not export** (`:177-190`).

---

## 3. Data model (verbatim, the parts that matter)

### The rate-limit tables

```ts
// packages/db/src/schema.ts:462-468 — BETTER AUTH OWNS THIS ONE OUTRIGHT
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// packages/db/src/schema.ts:490-502 — OURS
export const actionRateLimit = pgTable(
  "action_rate_limit",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
  },
  (r) => ({
    windowStartIdx: index("action_rate_limit_window_start_idx").on(
      r.windowStart,
    ),
  }),
);
```

`window_start` is **epoch millis** and holds the window's *start*, not the last hit.

### Schema shape at a glance

- **44 `pgTable`**, **28 `pgEnum`**, **2,045 lines**, **29 committed migrations** (`0000_stormy_raider.sql` … `0028_questionnaire_responses_group_scope.sql`). Note: `docs/architecture.md:33` and `:131` both say "45 tables" and are **wrong by one**; `README.md:143` ("44 tables · 29 migrations") is correct.
- Migration journal is drizzle-kit `version: "7"`, `dialect: "postgresql"`, `breakpoints: true` (`packages/db/migrations/meta/_journal.json`).
- Five migrations carry **hand-chosen names** rather than drizzle's random pair (`0001_add_burner_bio_year_contact_cols`, `0002_drop_legacy_burner_bio_fields`, `0004_questionnaire_audience_and_project_roles`, `0023_officer_consent_edition`, `0025_decision_reason`, `0026_wrangler_assignments`, `0027_decision_reason_invariant`, `0028_questionnaire_responses_group_scope`) — the journal `tag` is just a string, so renaming a generated file *before committing it* is legal and makes `git log` readable.

### Domain clusters (schema.ts section headers, with line numbers)

| Cluster | Tables | Lines |
|---|---|---|
| Identity (ours) | `users` | :283 |
| Better Auth identity (self-hosted) | `user`, `session`, `account`, `verification` | :358, :376, :398, :429 |
| Rate limiting | `rate_limit`, `action_rate_limit` | :462, :490 |
| 2FA / passkeys | `two_factor`, `passkey` | :518, :547 |
| Year namespace | `editions` | :574 |
| Profile | `burner_bios`, `profile_keys` | :605, :702 |
| Camps / tenancy | `groups`, `memberships`, `invites` | :717, :752, :1042 |
| Org permission layer | `org_departments`, `org_department_domains`, `org_roles`, `org_role_assignments` | :800, :854, :887, :924 |
| Project roles | `project_roles`, `member_role_assignments` | :949, :988 |
| Registration | `registrations`, `wrangler_assignments`, `section_reviews`, `section_review_replies` | :1074, :1190, :1229, :1262 |
| Questionnaire spine ("ported 1:1 from Camp 404") | `questionnaire_definitions`, `questionnaire_activations`, `questionnaire_responses`, `required_actions` | :1284, :1297, :1348, :1443 |
| Suppliers | `suppliers`, `supplier_onboarding`, `supplier_notes`, `supplier_documents`, `supplier_document_acks`, `supplier_declarations` | :1488, :1538, :1567, :1597, :1638, :1659 |
| Money (recording only) | `payments` | :1682 |
| Audit | `audit_events` | :1708 |
| Comms | `bulletins`, `notifications` | :1748, :1841 |
| Taxonomy | `camp_categories`, `group_categories` | :1782, :1816 |
| Account security | `account_deletion_requests`, `email_change_requests`, `security_events` | :1910, :1970, :2026 |

### Enums Camp 404 might actually want, verbatim

```ts
schema.ts:186  accountDeletionStatusEnum = pgEnum("account_deletion_status", ["pending","cancelled","completed"]);
schema.ts:192  emailChangeStatusEnum     = pgEnum("email_change_status", ["pending","confirmed","revoked","expired","cancelled"]);
schema.ts:212  securityEventKindEnum     = pgEnum("security_event_kind", [
                 "password_changed","password_reset_completed","session_revoked",
                 "sessions_revoked_others","email_change_requested","email_change_confirmed",
                 "email_change_revoked","deletion_requested","deletion_cancelled"]);
schema.ts:240  requiredActionTypeEnum    = pgEnum("required_action_type", ["questionnaire","acknowledgement","payment","profile_update"]);   // identical to Camp 404 schema.ts:118
schema.ts:247  requiredActionStatusEnum  = pgEnum("required_action_status", ["pending","completed","waived","expired"]);                     // identical to Camp 404 schema.ts:125
schema.ts:260  activationStatusEnum      = pgEnum("activation_status", ["draft","open","closed"]);                                            // identical to Camp 404 schema.ts:141
schema.ts:266  questionnaireStatusEnum   = pgEnum("questionnaire_status", ["draft","published","unpublished"]);                               // identical to Camp 404 schema.ts:150
schema.ts:254  questionnaireScopeEnum    = pgEnum("questionnaire_scope", ["everyone","individual","opt_in"]);   // NARROWER than Camp 404's 5-value version
```

The four identical enums are the visible fingerprint of "ported 1:1 from Camp 404's pattern" (`schema.ts:1280`, `docs/build-spec.md:115`).

### Index patterns worth stealing

```ts
// schema.ts:1943-1946 — one LIVE request per user, without blocking a second attempt later
onePendingPerUser: uniqueIndex("account_deletion_requests_one_pending_idx")
  .on(r.userId)
  .where(sql`${r.status} = 'pending'`),

// schema.ts:1938-1941 — the sweeper's exact query shape
dueIdx: index("account_deletion_requests_due_idx").on(r.status, r.graceEndsAt),

// schema.ts:2043 — DESC to match how every reader orders it
userCreatedIdx: index("security_events_user_created_idx").on(e.userId, e.createdAt.desc()),

// schema.ts:314-317 — case-INSENSITIVE uniqueness on an optional handle
usernameLowerIdx: uniqueIndex("users_username_lower_idx").on(sql`lower(${u.username})`),
```

---

## 4. Public API surface (exported signatures, verbatim)

### `packages/db/src/index.ts` — the barrel

```ts
export * as schema from "./schema";                                    // :9
export { configureLocalProxy } from "./local-proxy";                   // :10
export { cancelPendingDeletion, type CancelDeletionResult } from "./deletion";   // :14
export {
  consumeRateLimit, rateLimitIp,
  FORGOT_PASSWORD_MAX_PER_WINDOW, FORGOT_PASSWORD_WINDOW_SECONDS,
  type RateLimitVerdict,
} from "./rate-limit";                                                 // :17-23
export {
  connectionHost, isPoolerConnection, planMigration, type MigrationPlan,
} from "./migration-plan";                                             // :27-32

export type Database = NeonHttpDatabase<typeof schema>;                // :34
export type PooledDatabase = { db: NeonDatabase<typeof schema>; pool: Pool };  // :35

export function createHttpDb(): Database                               // :86
export function createPooledDb(): PooledDatabase                       // :146
```

`runDeployMigrations` is **deliberately not exported from the barrel** — `migrate.ts:118-123` says it is "EXPORTED ONLY SO IT CAN BE DRIVEN BY A TEST", and the build invokes the module as a script.

`packages/db/package.json:7-11` exposes exactly three entry points:
```json
"exports": { ".": "./src/index.ts", "./schema": "./src/schema.ts", "./crypto": "./src/crypto.ts" }
```
(Camp 404 by contrast exports 24 domain entry points from `packages/db/package.json:8-34`, so anything dropped in here needs its own `exports` entry.)

### `packages/db/src/migration-plan.ts`

```ts
export function connectionHost(connectionString: string): string | null            // :19
export function isPoolerConnection(connectionString: string): boolean              // :32
export type MigrationPlan =
  | { kind: "skip"; reason: string }
  | { kind: "run"; connectionString: string; usingUnpooled: boolean };             // :51-53
export type MigrationEnv = Readonly<Record<string, string | undefined>>;           // :61
export function planMigration(env: MigrationEnv = process.env): MigrationPlan      // :63
```

`MigrationEnv` is "deliberately looser than `NodeJS.ProcessEnv`, which Next's types augment to make `NODE_ENV` REQUIRED — that would force every caller and every test to supply a variable this function does not consult" (`migration-plan.ts:55-60`). **Camp 404 will hit exactly this if it copies the signature as `NodeJS.ProcessEnv`.**

### `packages/db/src/rate-limit.ts`

```ts
export const FORGOT_PASSWORD_MAX_PER_WINDOW = 3;                                   // :46
export const FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60;                             // :47
export interface RateLimitVerdict { allowed: boolean; retryAfterSeconds: number }   // :49-53
export async function consumeRateLimit(input: {
  key: string; max: number; windowSeconds: number; now?: Date;
}): Promise<RateLimitVerdict>                                                       // :82-87
export function rateLimitIp(headers: { get(name: string): string | null }): string  // :148-150
```

Note `rateLimitIp`'s parameter is a **structural** `{get(name): string|null}`, not `Headers` — so a plain object satisfies it in a test (`rate-limit.test.ts:16-20`).

### `packages/db/src/crypto.ts`

```ts
export function encrypt(plaintext: string): string                                  // :41
export function decrypt(stored: string): string                                     // :52
export function decryptOrNull(stored: string | null | undefined): string | null     // :76
export type DecryptedField =
  | { state: "empty"; value: null }
  | { state: "ok"; value: string }
  | { state: "unreadable"; value: null };                                           // :95-98
export function decryptField(stored: string | null | undefined): DecryptedField     // :103
```

### `packages/db/src/local-proxy.ts`

```ts
export function configureLocalProxy(): void                                         // :26
```

### `packages/db/src/migrate.ts`

```ts
export { connectionHost, isPoolerConnection, planMigration, type MigrationPlan }
  from "./migration-plan";                                                          // :106-111
export async function runDeployMigrations(): Promise<void>                          // :124
```

### `packages/db/src/seed.ts`

```ts
export async function ensureSeededOrgRoles(db: Db): Promise<number>                 // :136
export async function ensureSeededOrgDepartments(db: Db): Promise<number>           // :155
export async function seedReferenceData(db: Db): Promise<void>                      // :230
// type Db = ReturnType<typeof createPooledDb>["db"];                               // :107
```

### `packages/db/src/deletion.ts`

```ts
export interface CancelDeletionResult { cancelled: boolean; email: string | null }   // :23-28
export async function cancelPendingDeletion(input: {
  userId?: string;
  authUserId?: string;
  via: "sign_in" | "explicit";
  now?: Date;
  context?: { ip: string | null; userAgent: string | null };
}): Promise<CancelDeletionResult>                                                    // :43-68
```

### `packages/db/src/__tests__/support/fake-db.ts`

```ts
export interface WhereFilter { column: string; value: unknown }                       // :22-27
export function whereFilters(node: unknown): WhereFilter[]                            // :36
export interface RecordedOp { kind; table; inTransaction; projection; values; set;
  where; ordered; limit; returning; conflictTarget; conflictAction }                   // :58-77
export type OpHandler = (op: RecordedOp) => unknown[];                                // :80
export interface FakeDbHandle { db: unknown; ops: RecordedOp[];
  readonly transactions: number; opsOn(table, kind?): RecordedOp[] }                   // :82-94
export function createFakeDb(handler: OpHandler = () => []): FakeDbHandle              // :108
```

### `apps/web/lib/db.ts` — the per-app handle

```ts
export function db()                                                                   // :10
export type Tx = Parameters<Parameters<PooledDatabase["db"]["transaction"]>[0]>[0];     // :22-24
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>        // :35
export function requireDb(): boolean                                                    // :49
```

That `Tx` type derivation is a small, genuinely reusable trick — it names the object drizzle hands the transaction callback without exporting a drizzle internal.

---

## 5. Validation and edge-case rules, digit-exact

### The three migration refusals (verbatim error text)

**No DB on a production deploy** (`migration-plan.ts:74-78`):
> `[migrate] PRODUCTION DEPLOY with no database configured (DATABASE_URL_UNPOOLED and DATABASE_URL both unset). Refusing to complete a production build that would silently apply no migrations. Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.`

**Pooled endpoint, any environment** (`migration-plan.ts:91-96`):
> `[migrate] refusing to run advisory-locked migrations against a POOLED (PgBouncer) endpoint (host <host>). Session-scoped advisory locks do NOT hold on a transaction-pooling endpoint, so the concurrent Vercel builders would not serialise. Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.`

**Any Vercel deploy without the unpooled URL** (`migration-plan.ts:110-115`):
> `[migrate] DEPLOY without DATABASE_URL_UNPOOLED. Refusing to fall back to DATABASE_URL: Neon's Vercel integration sets DATABASE_URL to the POOLED endpoint by default, where session advisory locks do not hold — concurrent builders would not serialise and could both migrate and seed. Add DATABASE_URL_UNPOOLED (Neon's direct/unpooled endpoint) to THIS environment.`

**The incident behind the third one, verbatim** (`migration-plan.ts:98-108`): the guard used to read `isProductionDeploy`. A *preview* build with `DATABASE_URL_UNPOOLED` unset fell through to `DATABASE_URL`, which Neon's integration points at the pooled endpoint, whose host string does not reliably say "pooler" — so `isPoolerConnection` waved it through, the advisory lock was taken on a transaction-pooling connection where it does not hold, **two builders each held a lock that protected nothing, both saw an empty `editions`, and both seeded — 40 suppliers where there should have been 20.**

The full truth table, from `migrate.test.ts:47-149`:

| `DATABASE_URL_UNPOOLED` | `DATABASE_URL` | `VERCEL_ENV`/`VERCEL` | `NEON_LOCAL_PROXY` | outcome |
|---|---|---|---|---|
| — | — | — | — | `skip` |
| — | — | `preview` | — | `skip` |
| — | — | `production` | — | **throws** "PRODUCTION DEPLOY with no database" |
| direct | pooled | `production` | — | `run`, `usingUnpooled: true` |
| — | pooled | — | — | **throws** "POOLED (PgBouncer) endpoint" |
| — | direct | `production` | — | **throws** "DEPLOY without DATABASE_URL_UNPOOLED" |
| — | direct | `preview` \| `development` \| `VERCEL=1` | — | **throws** "DEPLOY without DATABASE_URL_UNPOOLED" |
| direct | pooled | `preview` | — | `run`, `usingUnpooled: true` |
| — | direct | — (off Vercel) | — | `run`, `usingUnpooled: false`, **loud warning** |
| — | pooled | — | `1` | `run` (guards exempted) |

### The rate limiter, digit-exact

- `FORGOT_PASSWORD_MAX_PER_WINDOW = 3`; `FORGOT_PASSWORD_WINDOW_SECONDS = 900`.
- `STALE_ROW_HORIZON_MS = 86_400_000` (24 h).
- Boundary: `count <= max` allows. So the **3rd** attempt is allowed and the **4th** is refused (`rate-limit.test.ts:91-107`).
- `retryAfterSeconds` derives from the **row's** `window_start`, not `now`: a window that started 300,000 ms ago in a 900 s window yields exactly `600` (`rate-limit.test.ts:109-118`).
- Past the window's end the floor applies: `1` (`rate-limit.test.ts:120-134`).
- Empty result → `{allowed: true, retryAfterSeconds: 0}` (`rate-limit.ts:127`).
- Storage throw → allowed + one `console.error` whose first arg contains `[rate-limit]` (`rate-limit.test.ts:168-179`).
- Exactly **one** `execute()` call per invocation (`rate-limit.test.ts:181-193`).
- The sweep's `AND key <> ${key}` exists because "a CTE delete and the INSERT share one snapshot, so a row deleted here and conflicted on below would be the same tuple touched twice in one command" (`rate-limit.ts:103-105`).

### Crypto, digit-exact
- IV 12 bytes, tag 16 bytes; minimum valid ciphertext length is `12 + 16 + 1 = 29` bytes decoded.
- Key: **≥ 16 chars** (15 throws, 16 does not — `crypto.test.ts:127-133`).
- `scryptSync(raw, "quagga-pgcrypto-v1", 32)`, cached in module state — which is why `crypto.test.ts` uses `vi.resetModules()` to test rotation (`crypto.test.ts:21-26`).

### Advisory lock, digit-exact
- Key `42_97_2027` (i.e. `42972027`).
- `LOCK_TIMEOUT_MS = 120_000`, applied as **both** `lock_timeout` and `statement_timeout`, then `statement_timeout = 0` after acquisition.
- Rationale for 120 s: "applying 0000–0012 against a fresh Neon branch takes seconds", and 2 minutes is "far below Vercel's build ceiling" (`migrate.ts:86-97`).

### Local proxy defaults
- host `localhost`, ws port `5433` → `localhost:5433/v1`; http port `4444` → `http://localhost:4444/sql`.
- Compose maps wsproxy `5433:80` and httpproxy `4444:4444` (`docker-compose.local.yml`).
- Gate is `=== "1"` exactly.

### SQL logger
- Gate `QUAGGA_SQL_LOG === "1"`; output `"[sql] " + query.replace(/\s+/g," ").slice(0,160)`.

---

## 6. Consumers / call sites (found by grep across the whole donor repo)

**`consumeRateLimit` / `rateLimitIp` / `FORGOT_PASSWORD_*`:**
- `apps/web/lib/account-actions.ts:43-45`, `:264-266` — key `` `forgot_password:${rateLimitIp(await headers())}` ``
- `apps/org/lib/actions/password.ts:7-9`, `:49-51` — same key, same budget
- `apps/suppliers/lib/actions/password.ts:7-9`, `:43-45` — same again (the audit calls these three near-identical, `docs/simplification-audit.md:359`)
- `apps/web/app/api/report/route.ts:1,:23`, `apps/org/app/api/report/route.ts:1,:14`, `apps/suppliers/app/api/report/route.ts:1,:14`
- `apps/web/app/api/report/transcribe/route.ts:1,:17` (+ org `:13`, suppliers `:13`)
- **Injected, not imported, into core**: `packages/core/src/report-server/handler.ts:57-58` declares `consumeRateLimit` as an option — `"The app passes consumeRateLimit from @quagga/db."` — and `report-server/transcribe.ts:50`. That is the DI seam that keeps `@quagga/core` DB-free.

**`planMigration` / `connectionHost`:**
- `apps/org/lib/system-status.ts:53`, `:180`, `:239` — the `/system` panel.
- `packages/db/src/__tests__/migrate.test.ts:2` (imports them via `../migrate`'s re-export).
- The simplification audit flags the three-path re-export as redundancy (`docs/simplification-audit.md:1052-1058`): `index.ts:27-32` and `migrate.ts:75` both import from `./migration-plan`, and `migrate.ts:106-111` re-exports them under a comment that is no longer true. **If you lift this, lift `migration-plan.ts` and export it once.**

**`cancelPendingDeletion`:**
- `packages/auth/src/config.ts:16`, `:179` — the Better Auth session-create hook (out of scope by instruction, but this is the *shape* of the integration).
- `apps/web/lib/account-actions.ts:42`, `:1022` — the explicit Cancel button.

**`NEON_LOCAL_PROXY`:** `docker-compose.local.yml`, `turbo.json` (globalEnv), `README.md`, `scripts/e2e-local.sh:25`, `docs/build-spec.md`, plus two app tests that stub it (`apps/suppliers/lib/__tests__/db-handles.test.ts:24`, `apps/web/lib/__tests__/bio-ciphertext-preservation.test.ts`).

**`turbo.json` globalEnv entries owned by this unit:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGCRYPTO_KEY`, `NEON_LOCAL_PROXY` (`turbo.json:5-20`). Note `QUAGGA_SQL_LOG`, `NEON_LOCAL_PROXY_HOST`, `NEON_LOCAL_WS_PORT` and `NEON_LOCAL_HTTP_PORT` are **read by code but declared in neither `turbo.json` nor `.env.example`** — an audit-grade gap (`docs/simplification-audit.md:1203-1224` records the same class of problem for four other vars).

---

## 7. UX behaviours (what a human actually sees)

This is a DB layer, so its "UX" is operator-facing. Three surfaces:

1. **Build logs.** Every branch prints a full sentence, not a status code: `[migrate] using DATABASE_URL_UNPOOLED (Neon direct/unpooled endpoint — session advisory locks hold here).` (`migrate.ts:135-137`); `[migrate] acquiring advisory lock 42972027 (blocking, bounded to 120000ms)...` (`:159-162`); `[migrate] no edition found — seeding reference data...` (`:197`); `[migrate] reference data present — not re-seeding.` (`:227`); `[migrate] seeded 2 missing org role(s).` vs `[migrate] org roles present.` (`:246-250`); and on a failed seed, `[migrate] seeding FAILED and was rolled back — the database is unseeded, not half-seeded. Redeploy to retry.` (`:219-223`).

2. **The `/system` panel** (`apps/org/lib/system-status.ts`). Three rules stated at `:13-32`, in order of how badly they would hurt if broken: **(1) never print a secret** — the one exception is a database *hostname* parsed out with `connectionHost` "so a password in the connection string cannot come with it", with `redactSecrets` as the backstop and a unit test that seeds every credential env var with a marker and asserts no marker survives into any rendered string; **(2) derive, do not duplicate** — "the migration verdict comes from @quagga/db's `planMigration`, the same function the build calls. A page that reported its own second opinion of the config would be worse than no page, because it would be believed"; **(3) say why, not just what** — `"Email verification: off"` invites someone to go look for a switch; `"Off — impossible without an email sender; it switches on the moment RESEND_API_KEY exists"` ends the investigation.

   `CheckTone = "ok" | "degraded" | "attention" | "info"` (`:73`) — and `degraded` vs `attention` is deliberately not one state: "A deployment with no Resend key is DEGRADED: it is working exactly as designed… A production deploy whose migration would refuse to run needs ATTENTION. If everything amber shouted, nobody would look." (`:63-71`).

   `migrationCheck` renders four states: **"Would refuse to run"** (attention — it catches `planMigration`'s throw and prints *the exact sentence the build would fail with*, redacted, `:234-247`), **"Skipped — no database"** (degraded), **"Direct (unpooled) endpoint"** (ok), **"Falling back to DATABASE_URL"** (degraded). `referenceDataCheck` renders **"No active edition"** with the copy: *"Nothing has seeded this database, so every edition-scoped page falls through to the preview shell and reads like a missing env var when the environment is correct."* (`:301-306`).

3. **`probeDatabase()`** — one timed `select 1` plus a separate active-edition read, each under a 5,000 ms `Promise.race` timeout (`apps/org/lib/system-probe.ts:28-53`, `:59-88`). "It probes rather than infers. 'DATABASE_URL is set' and 'the database answers' are different claims" (`:17-20`). The edition read is separate on purpose because "a connection that works but has no reference data is a real, distinct state (a migrated-but-unseeded deployment), and collapsing it into 'connected' hides the actual fault" (`:67-69`). It never throws — "A status page that goes down with the thing it monitors is worth nothing" (`:22-25`).

---

## 8. Test coverage

**`packages/db/vitest.config.ts`** — the most instructive config in either repo:

- `include: ["src/**/__tests__/**/*.test.ts"]`, `environment: "node"`.
- Coverage `provider: "v8"`, `reporter: ["text","json-summary","json"]`, `reportOnFailure: true`, `include: ["src/**/*.ts"]` — "Count every source file, not only the ones a test imports" (`:11`).
- **`src/schema.ts` is excluded, and the reason is measured and honest** (`:16-37`): v8 measures **zero branches** across ~2,000 lines; its 109 "functions" are drizzle column/index builder callbacks whose only failure mode is a type error `tsc --noEmit` already catches; the file runs on *any* import. And then the part almost nobody writes down: **including it would move the package to 84.72 lines / 78.16 branches / 88.51 functions / 84.90 statements — eight points better than what is reported — and they exclude it anyway.** "Those points are earned by importing a file, not by testing behaviour, and a number that flatters us for an import is the kind this repo has already thrown away once."
- Thresholds (a **ratchet**, set ~3 points below a measured run of 76.44 / 76.76 / 66.66 / 78.16): `lines: 73, statements: 74, functions: 63, branches: 75` (`:57-62`).
- A note on metric sensitivity: "the denominator here is only 39, so ONE untested function moves the metric by about 2.5 points. That sensitivity is the point — but it also means this floor is the one to think about *before* adding a function, not to nudge afterwards." (`:46-49`).
- And a statement of **what is honestly dark**: `seed.ts`'s upsert sequences, "whose correctness IS the round trip (that the ON CONFLICT target matches a real unique constraint, that the slug-collision loop terminates against real rows). A fake driver returns whatever the test tells it to, so a unit test of those would assert its own fixture. They belong to `pnpm e2e:local`, against a real Postgres." (`:51-56`).

**Every test file states what it does *not* prove.** `fake-db.ts:10-14`, `rate-limit.test.ts:4-7` ("a green run here is not evidence of it"), `migrate-runner.test.ts:8-11` ("What it CANNOT prove… is the advisory lock's semantics… That needs two live Postgres sessions"), `deletion.test.ts:9-16`, `db-handles.test.ts:8-13` ("Roughly four lines and one function stay permanently dark in this file; that is an honest gap, not grounds for excluding it").

**Two anti-vacuity guards**, both worth copying verbatim as a habit:
- `schema-invariants.test.ts:38-44` — `expect(TABLES.length).toBeGreaterThan(30)` because "every assertion below loops over TABLES, and a loop over an empty list passes silently".
- `questionnaire-upsert-target.test.ts:86-93` — a second `it` per file asserting there is at least one block to check, "Guards the guard: if these files are refactored and the upsert moves, the test above would pass vacuously and prove nothing".

**A per-file timeout with a measured justification** — `db-drivers.test.ts:4-18`: `vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })`, because `vi.resetModules()` makes the first case pay a cold import of drizzle + @neondatabase/serverless + ws + the 2,000-line schema; locally 1.1 s with 48 ms of imports, but on a GitHub runner with a cold FS cache the first case measured **5,061 ms against the 5,000 ms default** (run 30939100814, 4 Aug 2026). "A limit a slower runner crosses at random is a flake, not a gate." Scoped to the file on purpose — raising `testTimeout` globally "would hide a genuine hang in every other db suite."

**Process-global state is snapshotted and restored.** `local-proxy.test.ts:5-13` and `db-drivers.test.ts:36-41` both snapshot `neonConfig.{wsProxy,fetchEndpoint,useSecureWebSocket,pipelineConnect}` and restore in `afterEach`, plus a parallel env snapshot/restore. Camp 404's own PGlite harness has an analogous seam (`__setDbOverride`) but no equivalent global-config discipline.

---

## 9. AfrikaBurn / multi-tenancy coupling

**Clean — take as-is:**
- `rate-limit.ts` — the only donor-specific things are the module name and the comment prefix `[rate-limit]`. `action_rate_limit` has no tenant column. **Zero coupling.**
- `migration-plan.ts` — pure string parsing over env. **Zero coupling.**
- `local-proxy.ts` — pure `neonConfig` mutation. **Zero coupling.**
- `crypto.ts` — one donor string, `KEY_SALT = "quagga-pgcrypto-v1"` (`crypto.ts:25`). **Do not change this value if you are porting ciphertext**; for a fresh Camp 404 deployment, pick your own salt and never change it after.
- `__tests__/support/fake-db.ts` — imports only `drizzle-orm`. **Zero coupling.**
- `docker-compose.local.yml` — container names `quagga-pg`/`quagga-wsproxy`/`quagga-httpproxy`, DB name `quagga`, volume `quagga-pgdata`. Pure rename.

**Light coupling — one or two edits:**
- `index.ts` — the env var is named `QUAGGA_SQL_LOG` (`index.ts:134`); the comment block cites specific donor incidents. Everything functional is generic.
- `migrate.ts` — **the bootstrap sentinel is `SELECT 1 FROM editions LIMIT 1`** (`:195`). Camp 404 has no `editions` table; the natural analogue is `camp_settings` (`packages/db/src/schema.ts:1422`, the physically-enforced singleton) or `camp_settings.bootstrappedAt`. The repair branch calls `ensureSeededOrgDepartments` / `ensureSeededOrgRoles`, both of which are pure org-tier and should be dropped or replaced with Camp 404's `DEFAULT_TEAMS` seed from `packages/db/src/camp-config.ts:32`.
- `deletion.ts` — imports `canCancelDeletion` and `deletionCancelledNotification` from `@quagga/core`, and writes `origin: "system", linkApp: "web"` on the notification (`:180-181`). `linkApp` exists **only** because there are three apps and `/account` exists in one of them (`deletion.ts:167-179`) — Camp 404 collapses that field away entirely. Otherwise the two-id-space resolution and the concurrency-guarded transaction are exactly what Camp 404's `packages/db/src/account.ts` would want.

**Heavy coupling — concept only:**
- `seed.ts` — every write is org/edition/supplier-shaped: `editions` (`:235`), the `org` `groups` row (`:256-261`), `orgRoles`/`orgDepartments` (`:275-279`), per-edition `campCategories` (`:285-291`), two org questionnaire templates keyed `org-theme-camp-form-2-2027` and `org-safety-checkin-2027` (`:438-455`), and the 20-supplier catalogue (`:466-475`). **The law at the top of the file and the four `ensure*` shapes are the asset; the contents are not.**
- `schema.ts` — 44 tables, and the tenancy is in the enums and the FKs, not in a wrapper. `groupKindEnum` (`:49`), `membershipRoleEnum` with `["god","org_staff","lead","admin","member","engineer"]` (`:71`), `editions` as "the root namespace" with `burner_bios` user×edition and `registrations` group×edition. **Rewrite, do not port.**

**One narrower flag worth calling out:** migration `0028_questionnaire_responses_group_scope.sql` is the single best-documented migration in either repo (see §10), and its *lesson* — that widening a unique index to include a nullable column silently drops the uniqueness guarantee, because Postgres treats NULLs as distinct — is 100% portable. Its *content* (adding `group_id` for camp-scoped answers) is the tenancy Camp 404 collapses.

---

## 10. Verbatim excerpts — the five most valuable pieces

### 10.1 `consumeRateLimit`'s single statement (`packages/db/src/rate-limit.ts:96-141`)

```ts
  try {
    // One statement, so concurrent lambdas cannot interleave a read and a write
    // and both conclude they are under the limit. `window_start` is exactly
    // that: when it falls outside the window the counter restarts, otherwise it
    // increments and the start is left alone.
    //
    // The sweep rides along as a data-modifying CTE rather than a second round
    // trip. It EXCLUDES this call's own key — a CTE delete and the INSERT share
    // one snapshot, so a row deleted here and conflicted on below would be the
    // same tuple touched twice in one command.
    const rows = (await createHttpDb().execute(sql`
      WITH swept AS (
        DELETE FROM action_rate_limit
         WHERE window_start < ${staleCutoff}
           AND key <> ${key}
      )
      INSERT INTO action_rate_limit (key, count, window_start)
      VALUES (${key}, 1, ${nowMs})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN action_rate_limit.window_start < ${windowStartCutoff} THEN 1
          ELSE action_rate_limit.count + 1
        END,
        window_start = CASE
          WHEN action_rate_limit.window_start < ${windowStartCutoff} THEN ${nowMs}
          ELSE action_rate_limit.window_start
        END
      RETURNING count, window_start
    `)) as unknown as { rows?: { count: number; window_start: number }[] };

    const row = Array.isArray(rows) ? rows[0] : rows.rows?.[0];
    if (!row) return ALLOWED;

    const count = Number(row.count);
    if (count <= max) return ALLOWED;

    const windowEndsAt = Number(row.window_start) + windowSeconds * 1000;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - nowMs) / 1000)),
    };
  } catch (err) {
    console.error("[rate-limit] storage failure, allowing request", err);
    return ALLOWED;
  }
```

**Why this is the single best asset in the unit for Camp 404:** it is a correct distributed fixed-window limiter in one round trip, with self-sweeping storage, no new dependency, no Redis/Upstash, and a documented fail-open. Camp 404 has no limiter at all and an open follow-up asking for one.

### 10.2 `planMigration` in full (`packages/db/src/migration-plan.ts:63-124`)

```ts
export function planMigration(env: MigrationEnv = process.env): MigrationPlan {
  const unpooled = env.DATABASE_URL_UNPOOLED;
  const pooled = env.DATABASE_URL;
  const connectionString = unpooled ?? pooled;
  const isProductionDeploy = env.VERCEL_ENV === "production";
  // Preview and production alike: a pooled fallback breaks the lock in both.
  const isVercelDeploy = Boolean(env.VERCEL || env.VERCEL_ENV);
  const neonLocal = env.NEON_LOCAL_PROXY === "1";

  if (!connectionString) {
    if (isProductionDeploy) {
      throw new Error(
        "[migrate] PRODUCTION DEPLOY with no database configured (DATABASE_URL_UNPOOLED and " +
          "DATABASE_URL both unset). Refusing to complete a production build that would silently " +
          "apply no migrations. Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.",
      );
    }
    return {
      kind: "skip",
      reason:
        "[migrate] no database configured (DATABASE_URL_UNPOOLED and DATABASE_URL both unset) — skipping migrations.",
    };
  }

  // Neon Local reroutes to a single local backend; the pooler/production guards
  // (which exist to catch PgBouncer transaction-pooling) do not apply there.
  if (!neonLocal) {
    if (isPoolerConnection(connectionString)) {
      throw new Error(
        "[migrate] refusing to run advisory-locked migrations against a POOLED (PgBouncer) endpoint " +
          `(host ${connectionHost(connectionString) ?? "unknown"}). Session-scoped advisory locks do NOT ` +
          "hold on a transaction-pooling endpoint, so the concurrent Vercel builders would not serialise. " +
          "Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.",
      );
    }
    // ANY Vercel deploy, not just production. This guard used to read
    // `isProductionDeploy`, and that gap is not hypothetical — it double-seeded
    // the real database. […]
    if (!unpooled && isVercelDeploy) {
      throw new Error(
        "[migrate] DEPLOY without DATABASE_URL_UNPOOLED. Refusing to fall back to DATABASE_URL: " +
          "Neon's Vercel integration sets DATABASE_URL to the POOLED endpoint by default, where session " +
          "advisory locks do not hold — concurrent builders would not serialise and could both migrate " +
          "and seed. Add DATABASE_URL_UNPOOLED (Neon's direct/unpooled endpoint) to THIS environment.",
      );
    }
  }

  return {
    kind: "run",
    connectionString,
    usingUnpooled: Boolean(unpooled),
  };
}
```

### 10.3 The lock + bootstrap core of `runDeployMigrations` (`packages/db/src/migrate.ts:150-225`, elided)

```ts
  const pool = new Pool({ connectionString });
  // One dedicated connection: the advisory lock and the migration MUST share it.
  const client = await pool.connect();

  try {
    // Bound the lock acquisition. See LOCK_TIMEOUT_MS.
    await client.query(`SET lock_timeout = ${LOCK_TIMEOUT_MS}`);
    await client.query(`SET statement_timeout = ${LOCK_TIMEOUT_MS}`);

    await client.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);

    // Don't time-bound the migration itself — only the wait for the lock.
    await client.query("SET statement_timeout = 0");

    // Run drizzle's migrator on the SAME connection that holds the lock.
    const db = drizzle(client);
    const migrationsFolder = fileURLToPath(
      new URL("../migrations", import.meta.url),
    );
    await migrate(db, { migrationsFolder });

    // BOOTSTRAP the reference data a brand-new database needs […]
    // ONLY WHEN THERE IS NO EDITION. This is a bootstrap, not a sync […]
    const seeded = await client.query("SELECT 1 FROM editions LIMIT 1");
    if (seeded.rowCount === 0) {
      const { seedReferenceData } = await import("./seed");

      // ALL OR NOTHING. The sentinel above is "does an edition exist", and the
      // seed's own first write is what creates one — so an unwrapped seed that
      // died halfway left an edition row behind with the org group […] missing,
      // and every subsequent deploy read the sentinel, concluded "already
      // seeded", and skipped the repair. […]
      // The advisory lock is SESSION-scoped, so it spans this transaction and
      // still keeps two concurrent deploys from seeding at once.
      await client.query("BEGIN");
      try {
        await seedReferenceData(drizzle(client, { schema }));
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(
          "[migrate] seeding FAILED and was rolled back — the database is " +
            "unseeded, not half-seeded. Redeploy to retry.",
        );
        throw err;
      }
    }
```

### 10.4 The seeding law (`packages/db/src/seed.ts:4-56`, condensed but verbatim)

> **The seeding principle (Ryan, 26 Jul 2026 — binding)**
>
> **Seeds contain ONLY org-owned reference/catalog data. Every burner, camp, membership, registration and questionnaire response — in EVERY environment, including the kickoff demo — is created live through the app.**
>
> There are no seeded accounts and no seeded user-generated content. […] it removes an entire class of seed/auth-identity drift — seeded users previously carried placeholder `authUserId = seed:<email>` strings and could never sign in, which made every "sign in as a seeded owner" step of every smoke test un-performable.
>
> […] Safe to run repeatedly: every write is keyed on the row's real unique constraint (or, where none exists, a find-then-write lookup).
>
> **BOOTSTRAP, NOT SYNC** — and "safe to run repeatedly" means the SECOND run changes nothing, not merely that it does not crash. Anything the org can edit in the console (a supplier's standing, its onboarding progress, which domains a department owns) is INSERT-IF-MISSING here. A seed that re-asserts the committed snapshot reverts real decisions on a schedule, silently, and the deploy that did it logs nothing an organiser would ever see.

And the guard at the bottom (`seed.ts:733-755`):

> A bare top-level `main()` meant that merely importing this module ran the ENTIRE reference seed — so once migrate.ts imported it on the already-seeded path too, every deploy re-seeded a live database: organiser edits reverted, deleted suppliers and categories came back, a supplier suspended by the org silently returned to good standing, all while the migrator logged "reference data present — not re-seeding".

with the concrete incident it produced, at `seed.ts:595-607`:

> This used to UPDATE the existing supplier from the sheet on every run, and `standing` is an ORG VERDICT: a supplier the org had suspended came back to `good` the moment anyone re-ran the seed, with nothing in the console to say why. […] The trade, stated plainly: re-importing a NEWER suppliers.json no longer updates rows that already exist. That is the right way round.

### 10.5 The fake-db chain (`packages/db/src/__tests__/support/fake-db.ts:112-210`, elided)

```ts
  const start = (kind: RecordedOp["kind"], projection: string[] = []) => {
    const op: RecordedOp = { kind, table: null, inTransaction: state.depth > 0,
      projection, values: [], set: null, where: [], ordered: false, limit: null,
      returning: false, conflictTarget: [], conflictAction: null };
    ops.push(op);

    // Every builder method returns `chain`, and `chain` is thenable — so the
    // source's `await db.select(...).from(...).where(...)` resolves through the
    // handler with the whole op assembled.
    const chain = {
      from(table)      { op.table = getTableName(table); return chain; },
      where(predicate) { op.where = whereFilters(predicate); return chain; },
      orderBy(...)     { op.ordered = true; return chain; },
      limit(n)         { op.limit = n; return chain; },
      set(patch)       { op.set = patch; return chain; },
      values(rows)     { op.values = Array.isArray(rows) ? rows : [rows]; return chain; },
      returning(_cols) { op.returning = true; return chain; },
      onConflictDoNothing(config) { op.conflictAction = "nothing";
                                    op.conflictTarget = columnNames(config?.target); return chain; },
      onConflictDoUpdate(config)  { op.conflictAction = "update";
                                    op.conflictTarget = columnNames(config.target); return chain; },
      then(onFulfilled, onRejected) {
        return Promise.resolve().then(() => handler(op)).then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  const builder = {
    select(projection) { return start("select", columnNames(projection)); },
    insert(table)      { const chain = start("insert"); return chain.from(table); },
    update(table)      { const chain = start("update"); return chain.from(table); },
    delete(table)      { const chain = start("delete"); return chain.from(table); },
    async transaction(callback) {
      state.opened += 1; state.depth += 1;
      try { return await callback(builder); } finally { state.depth -= 1; }
    },
  };
```

**Why this matters for Camp 404 specifically:** Camp 404 already has the *other* half of the test story (`packages/db/src/__tests__/_harness.ts` + `__setDbOverride`, PGlite). This fake is what you reach for when the thing under test is a *branch around* a query — "did it write `nameNormalized`, not the raw name?", "did it use `onConflictDoNothing` and not `onConflictDoUpdate`?", "did the WHERE compare `auth_user_id` and not `id`?" — and it runs in milliseconds with no Postgres. Camp 404's `packages/db/src/roster.ts`, `broadcasts.ts` and `questionnaire-lifecycle.ts` all have exactly this shape.

### 10.6 (bonus) Migration 0028's header — the best-argued migration in either repo

`packages/db/migrations/0028_questionnaire_responses_group_scope.sql`:

> **TWO PARTIAL UNIQUE INDEXES, NOT ONE WIDENED ONE.** This is the whole risk of this migration and it is worth stating plainly.
>
> The obvious move is to widen the existing index to include `group_id`. It would have been a live data-integrity bug: Postgres treats NULLs as DISTINCT in a unique index by default, so `(user, definition, edition, NULL)` no longer collides with itself and EVERY per-person questionnaire — the Burner Bio included — would accept unlimited duplicate rows per user. The one-answer-per-person guarantee would have been dropped by a migration whose stated purpose was adding a column.
>
> `NULLS NOT DISTINCT` (Postgres 15+) would also fix it, but partial indexes say the intent out loud and work on any version.

And migration `0027_decision_reason_invariant.sql`, which corrects data a previous migration's backfill got wrong — because "0025 cannot be edited: it is append-only and has already applied" — is the model for how to fix a bad migration under an append-only rule.

---

## 11. Dependency footprint

`packages/db/package.json`:
- **dependencies**: `@neondatabase/serverless ^1.1.0`, `drizzle-orm ^0.45.2`, `@quagga/core workspace:*`, `@quagga/types workspace:*`.
- **devDependencies**: `drizzle-kit ^0.31.10`, `tsx ^4.20.6`, `vitest ^4.1.7`, `@vitest/coverage-v8 ^4.1.10`, `typescript ^6.0.3`, `eslint ^10.4.0`, `@types/node ^25.9.1`, plus the two workspace configs.

Against Camp 404 (`/home/ryan/repos/Personal/camp-404/packages/db/package.json`): `@neondatabase/serverless`, `drizzle-orm`, `drizzle-kit` are **identical ranges and identical lock resolutions**. What Camp 404 would need to add:
- **`tsx`** — required for `db:migrate:deploy` and `db:seed` (`"db:migrate:deploy": "tsx src/migrate.ts"`, `"db:seed": "tsx src/seed.ts"`). Camp 404 has neither script and no `tsx`.
- **`@vitest/coverage-v8`** — Camp 404 has no coverage provider in any workspace, while `turbo.json`'s `test` task already declares `outputs: ["coverage/**"]` that nothing writes.
- Nothing else. `rate-limit.ts`, `migration-plan.ts`, `local-proxy.ts` and `fake-db.ts` add **zero** new packages.

**Import-level notes:**
- `rate-limit.ts` imports `sql` from `drizzle-orm` and `createHttpDb` from `./index` — a circular-ish edge (`index.ts` re-exports `rate-limit.ts`, which imports `index.ts`) that works because the import is used lazily inside the function. Copy that shape or invert it to a `db` parameter.
- `migration-plan.ts` imports **nothing**. Pure.
- `local-proxy.ts` imports only `neonConfig`.
- `fake-db.ts` imports `{ Column, Param, SQL, getTableName, is }` from `drizzle-orm`; `schema-invariants.test.ts` additionally uses `{ StringChunk }` and `{ PgTable, getTableConfig }` from `drizzle-orm/pg-core`.
- `seed.ts` imports six symbols from `@quagga/core` (`CANONICAL_CAMP_CATEGORIES`, `SOUND_SCALE`, `SEEDED_ORG_DEPARTMENTS`, `departmentRoleRows`, `normalizeCategoryLabel`, `normalizeName`, `seededOrgRoleRows`) plus `SupplierImportRow` from `@quagga/types` — all of them AfrikaBurn-specific.

**A porting trap Camp 404 will hit:** the donor's app-level vitest configs alias `"server-only"` to a stub (`apps/*/vitest.config.ts`); Camp 404's `apps/web/vitest.config.ts` aliases only `"@"`. `apps/web/lib/db.ts:1` and `apps/org/lib/system-probe.ts:1` both start with `import "server-only"`, so any of those consumers ported into Camp 404 will throw the moment a vitest test imports them until that alias exists. (Note `packages/db/src/*` itself carries **no** `server-only` import — the package is clean.)

---

## 12. Gotchas, corrections, and things not to trust

1. **`docs/architecture.md:33` and `:131` say "45 tables". The real count is 44** (`grep -c '= pgTable(' packages/db/src/schema.ts` → 44). `README.md:143` is correct.
2. **`rate-limit.ts:40-45`'s "if you change one, change both" points at a rule that does not carry those numbers.** The doc comment says the constants mirror a `customRules` entry for `/forget-password` in `@quagga/auth`'s `env.ts`; the audit verified (`docs/simplification-audit.md:1076`) that `resolveRateLimit` returns `{}` unless `AUTH_RATE_LIMIT_WINDOW_SECONDS`/`AUTH_RATE_LIMIT_MAX` are set, and production leaves them unset — so in production no such rule is constructed at all. **The instruction is unfollowable.** Do not copy the comment.
3. **`migrate.ts:100-111`'s re-export comment is stale.** It says "this is where every existing caller and test looks for them"; the only importer of `../migrate` for those symbols is one test file, and the real consumer (`apps/org/lib/system-status.ts:53`) imports from `@quagga/db` (`docs/simplification-audit.md:1052-1058`). **Lift `migration-plan.ts` and export it once.**
4. **Better Auth deletes rows it did not write.** `schema.ts:470-479` records, verified against `better-auth 1.6.25 dist/api/rate-limiter/index.mjs`, that its database storage runs `DELETE FROM rate_limit WHERE last_request < now - max(configured window, 10s, 60s)` — **the whole table, not only its own keys** — after any successful window roll. That is why `action_rate_limit` exists. If Camp 404 ever adopts a library-managed limiter table, do not co-tenant with it.
5. **The 40-suppliers double-seed happened twice, through two different doors** — once via the preview-deploy pooled-URL gap (`migration-plan.ts:98-108`), once via `seed.ts`'s unguarded top-level `main()` being triggered by an import from `migrate.ts` (`seed.ts:733-746`). Both fixes are one-liners; both bugs were invisible.
6. **`db-drivers.test.ts` needs its own timeout.** Copying the file without `vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })` reproduces a random CI flake on cold runners.
7. **`neonConfig` is process-global and shared across every test file in the package.** Any test that calls `configureLocalProxy()` must snapshot and restore it, or it silently re-points whatever runs next (`local-proxy.test.ts:5-7`).
8. **`createHttpDb().execute()` returns different shapes on the two drivers** — a bare array on neon-http, `{rows}` on neon-serverless. `index.ts:90-94` names the only two callers that can see the difference (`rate-limit.ts` handles both; `system-probe.ts` discards the result). Any new `db.execute()` in ported code must handle both, or it works in production and silently no-ops under `NEON_LOCAL_PROXY=1` (or vice versa).
9. **`E2E_RESET_DB=1` must drop BOTH schemas.** `scripts/e2e-local.sh:62-70`: `DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;` — "dropping only `public` leaves the tracker behind and the migrator then reports 'up to date' against an empty database — a silent no-op that looks like success and fails much later."
10. **The donor's own honesty box** (`docs/simplification-audit.md:12-30`): all evidence in that audit is **static-only** — the e2e suite was never run for it — and only 12 of 66 findings have been applied. Any claim it makes about runtime is a hypothesis.
11. `QUAGGA_SQL_LOG`, `NEON_LOCAL_PROXY_HOST`, `NEON_LOCAL_WS_PORT`, `NEON_LOCAL_HTTP_PORT` are read by code and declared in neither `turbo.json`'s `globalEnv` nor `.env.example`. Under Turborepo that means a change to one of them does not invalidate a task hash.
12. **`schema.ts:38-42`'s "logical join, no FK" decision.** There is deliberately no database foreign key from `users.auth_user_id` to `user.id`, because a real FK would force either cascade-deleting the anonymised stub (destroying the history POPIA erasure relies on) or blocking the identity deletion entirely. Camp 404 has the same two-id-space situation with Neon Auth and the same "Lost Cat" sanitiser (`packages/db/src/account.ts`) — worth confirming the same call was made.

---

## 13. Recommended take-list for Camp 404 (ordered)

1. `rate-limit.ts` + the `action_rate_limit` table + `rate-limit.test.ts` — **drop-in**, closes a real open gap, zero new deps.
2. `migration-plan.ts` + `migrate.test.ts` — **drop-in** pure module. Then decide whether to adopt the runner.
3. `__tests__/support/fake-db.ts` — **drop-in**, composes with the existing PGlite harness.
4. `schema-invariants.test.ts` — **light-adapt** (swap the encrypted-column list to Camp 404's `id-documents.ts` set; the FK sweep and naming checks are free).
5. `migrate.ts` — **light-adapt**: keep the lock, the timeouts, the finally-block; replace the `editions` sentinel with `camp_settings`/`bootstrappedAt` and the org-role repair with `camp-config` team seeding. Requires adding `tsx` and changing `vercel-build` to `tsx src/migrate.ts && next build`.
6. `local-proxy.ts` + `docker-compose.local.yml` + the `NEON_LOCAL_PROXY` branch in `index.ts` — **light-adapt**; the payoff is an offline-runnable stack and the 152 ms→2 ms transport fix if Camp 404 ever adds a browser-driven e2e run against a real DB.
7. The `vitest.config.ts` coverage discipline (provider, `include: ["src/**/*.ts"]`, the schema exclusion with its rationale, a measured ratchet) — **pattern**; Camp 404 has no coverage tooling at all.
8. `apps/org/lib/system-status.ts` + `system-probe.ts` as the model for a Camp 404 `/captains/system` panel — **concept + strong pattern** (three rules; derive-don't-duplicate; probe-don't-infer; `degraded` vs `attention`).
9. `crypto.ts`'s `DecryptedField` tri-state — **light-adapt** into Camp 404's existing `packages/db/src/crypto.ts`; it is a strictly-better read contract for any safety-relevant encrypted column.
10. `deletion.ts`'s two-id-space + concurrency-guarded-UPDATE shape — **concept**, to compare against Camp 404's `account.ts`.
