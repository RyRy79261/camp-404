# AGENTS.md

Guidance for AI agents (and humans) working in the Camp 404 repo. See
`README.md` for the day-to-day quickstart and `docs/brief.md` for the
product vision.

## Project

Camp 404 is a cross-platform camp-management app (web + iOS + Android from
one Next.js codebase) for an Afrikaburn theme camp. It is an internal
operations tool for ~30–80 people, not a social network.

## Workspace layout

Turborepo + pnpm workspaces. Node >= 22, pnpm 10.x.

```
apps/
  web/        Next.js 16 app (App Router, React 19, Tailwind v4)
  mobile/     Capacitor host wrapping the web static export
  admin-cli/  Node CLI for data ops
packages/
  core/       Framework-free domain logic: access, privacy, redaction, … (@camp404/core)
  ui/         Shared shadcn/ui components (@camp404/ui)
  db/         Drizzle schema + migrations (@camp404/db)
  auth/       Self-hosted Better Auth server and client (@camp404/auth)
  types/      Zod schemas + shared TS types (@camp404/types)
  telegram/   Bot client and handlers; outbound built but off (@camp404/telegram)
  ai-prompts/ Versioned prompt templates (@camp404/ai-prompts)
  eslint-config/ typescript-config/
```

`pnpm-workspace.yaml` is the source of truth.

## Commands

Run from the repo root; Turbo fans tasks out across the workspace.

```bash
pnpm install                          # install (use --frozen-lockfile in CI)
pnpm dev                               # dev servers
pnpm turbo run lint typecheck test build   # the full CI gate
pnpm format                            # prettier --write
```

Per-package work uses `--filter`, e.g. `pnpm --filter @camp404/web dev`.
The web typecheck runs `next typegen` first, so typed routes are checked
against the real route tree (`next-env.d.ts` is generated, not committed).

Four traps that already cost real time:

- **PGlite has one connection.** The db integration tests
  (`packages/db/src/__tests__/_harness.ts`) back every driver with one
  in-process Postgres. A `createHttpDb()` query issued while a
  `withTransaction` callback is still open waits forever (a test timeout),
  though production would use a second connection. Fix the code, not the
  test: pass the `tx` down, or read after the transaction returns. Green on
  PGlite is not proof of Neon pooling or cold starts.
- **E2E runs on the in-memory test store.** Playwright starts `next dev` with
  `E2E_TEST_MODE=1`, and `apps/web/lib/test-store.ts` stands in for the login
  and the database. A data function with no test-store twin cannot be driven
  by Playwright. Add the twin with the feature, or say in the PR that the flow
  has no E2E cover.
- **A `"use server"` file may export only async functions.** A `const`
  export breaks the page under `next dev`, and neither typecheck nor lint
  catches it. Put shared constants in a plain module.
- **No `loading.tsx` under `app/(console)/`.** Three reasons, each found the
  hard way. A page below one that calls `notFound()` answers 200, and its
  `redirect()` happens in the browser instead of on the server. And the console
  header's `next/link`s hydrate before the streamed page arrives, so React
  client-renders the page and leaves the server's copy behind in a hidden
  `<div id="S:0">`: the page is in the DOM twice (invisible, but a Playwright
  `getByLabel` sees two). Navigation feedback comes from the nav item's own
  pending state (`useLinkStatus` in `components/console/console-nav.tsx`).
- **"branches limit exceeded" in the `schema-migration` job is capacity, not
  code.** Each run makes a Neon branch; several stacked PRs pushed together
  hit the project's limit. Re-run the failed job.

## Design

**The look is the AfrikaBurn contributors app's organiser console** (owner's
call, 2026-09-17): a desktop dashboard with a sticky header and nav, AfrikaBurn's
tokens and kit, and Camp 404 magenta as the accent skin. The earlier Pencil
boards in `design/` are history, not the target; do not keep a phone-only
layout because a board drew one. For a new surface, copy the composition of
AfrikaBurn's nearest equivalent (`apps/org/app/(console)/**` in that repo) and
restyle only with tokens; do not invent a design.

- **The signed-out landing page (`apps/web/app/landing-hero.tsx`) is NOT part
  of the restyle** (owner, 2026-09-23: the AfrikaBurn look is for "the
  components and the dashboards, not the landing page"). It keeps Camp 404's
  own glitch design and sets its original palette and font on itself. Do not
  recompose it after an AfrikaBurn page.
- Tokens: `packages/ui/src/styles/globals.css` (AfrikaBurn's file plus the
  `.camp-accent` skin on `<html>`). Montserrat, dark-first: `<html>` carries
  the `dark` class in `app/layout.tsx`.
- Shell: `apps/web/app/(console)/layout.tsx` draws the header and a nav bar
  filtered by rank on the server (`lib/console-nav.ts`). A page starts with
  `PageHeading` (`@camp404/ui/components/page-heading`) and owns no container.
- Loading: no `loading.tsx` in the console (see the gotcha under Commands);
  the pressed nav item pulses while the next page renders.

## Database — read this before touching the schema

The database is Neon Postgres + Drizzle ORM. Sign-in is self-hosted Better
Auth (`packages/auth`, owner's call 2026-09-22, replacing managed Neon Auth):
its tables (`user`, `session`, `account`, `verification`, `rate_limit`,
`two_factor`, `passkey`) live in our schema, and our `users` table joins to
them via `auth_user_id` (`user.id`). There is deliberately no foreign key
between the two: erasure deletes the `user` row and keeps `users` as the
"Lost Cat" stub.

Sign-in rules worth knowing before you touch `packages/auth`:

- **A Vercel deployment without `BETTER_AUTH_SECRET` fails closed** (sign-in
  off, `/api/auth/*` answers 503), because the placeholder secret is in this
  public repo and previews share the production database. `authMayServe` is
  the one switch; do not add a second.
- **Passkeys are bound to a domain for life.** `AUTH_APEX_DOMAIN`
  (camp-404.com) scopes them so the bare domain and `www` share one. Changing
  the domain means every member re-enrols their passkeys (passwords keep
  working).
- **Google on a preview goes through production** (Better Auth's OAuth
  proxy, `packages/auth/src/oauth-proxy.ts`): Google calls back only the
  registered production URI, which hands the member back to the preview, and
  the preview signs them in against its own database. It needs
  `AUTH_OAUTH_PROXY_SECRET` (the same value on Production and Preview) and,
  on Preview, `AUTH_OAUTH_PROXY_URL`; without them it stays off and Google
  fails on a preview as before. Only this project's preview hosts are
  accepted (`isProjectPreviewOrigin`, pinned to the `ryry79261s-projects`
  scope); a renamed project or scope needs that pattern changed.
- **Keep `changeEmail` unmounted** until a flow that notifies the CURRENT
  address exists (AfrikaBurn's finding: the stock flow turns a stolen session
  into an account takeover).
- **Members moved from Neon Auth may be unverified** (password members were
  never asked to confirm). They confirm on Sign-in and security or on the
  invite gate (`components/account/confirm-email.tsx`); until then camp
  emails skip them and a GOD_EMAILS address does not count. Google refuses to
  link to an unverified local account on purpose (pre-account takeover), and
  the refusal lands on our sign-in form with a sentence
  (`app/auth/oauth-error.ts`). Never relax `requireLocalEmailVerified`.
- **An unconfirmed account cannot add a passkey or two-factor**
  (`packages/auth/src/email-proof.ts`). Sign-up is open, so it may belong to
  someone who signed up with another person's address first, and a passkey or
  TOTP secret would outlive the owner's password reset. The same plugin clears
  them when a reset link is used on an unconfirmed account, and takes back the
  session a verification link opens for an account with two-factor on, so the
  link never skips the code.
- **Sign-up says when an address already has an account** (accepted, owner's
  default 2026-09-24). With open sign-up and automatic sign-in, hiding it would
  mean every new member signs up and then signs in again. Sign-in and
  forgot-password stay enumeration-safe; keep them that way.

**`packages/db/src/schema.ts` is the single hand-authored source of truth.**
Everything under `packages/db/migrations/` — the `.sql` files,
`meta/_journal.json`, and `meta/*_snapshot.json` — is generated by
drizzle-kit. **Never hand-edit or hand-write any file in `migrations/`.**

To change the schema:

1. Edit `packages/db/src/schema.ts`.
2. Run `pnpm --filter @camp404/db db:generate` — this appends a new
   numbered migration and updates the journal/snapshot itself.
3. Commit the generated migration alongside the schema change.
4. `pnpm --filter @camp404/db db:migrate` applies migrations to the DB.

Migrations are **incremental and append-only**. `0000_initial.sql` is
frozen — never regenerate, edit, or delete an existing migration. Each
change is a new `0001_*.sql`, `0002_*.sql`, … `pnpm --filter @camp404/db
exec drizzle-kit check` validates consistency.

**One-off data fixes are migrations too.** `vercel-build` runs
`db:migrate` before `next build`, so a data fix written as a custom migration
(`pnpm --filter @camp404/db db:generate --custom --name <name>`, then fill in
the SQL) runs on the next deploy. Never ship a fix that needs someone to run a
CLI or SQL command against production by hand. Make it idempotent (`ON
CONFLICT DO NOTHING`, `WHERE ... IS NULL`) and test it on PGlite.

Two Postgres traps:

- **A nullable column in a unique index drops uniqueness for NULL rows.**
  Postgres treats NULLs as distinct, so `(user_id, definition_key,
activation_id)` would allow any number of duplicates whose
  `activation_id` is NULL. `questionnaire_responses.activation_id` is
  nullable, and `questionnaire_responses_user_def_cycle_idx` must stay on
  `(user_id, definition_key, cycle)`. When a nullable column must be in the
  rule, use two partial indexes.
- **`ON CONFLICT (cols)` against a partial unique index fails with 42P10**
  unless the statement repeats the index's `WHERE` (drizzle: `targetWhere`).
  The partial unique indexes today: `users_ref_code_uniq`,
  `captain_promotion_open_per_target_idx`,
  `questionnaire_activations_one_open_per_key_idx`,
  `notification_deliveries_broadcast_user_uniq`. A bare `ON CONFLICT DO
NOTHING`, with no target, is not affected.

**Driver choice.** `@camp404/db` exposes two drivers: `createHttpDb()` is
stateless, for route handlers and server components, and has **no
transactions**; `createPooledDb()` is a WebSocket pool, for cron jobs and
the CLI, and **supports transactions**. Multi-statement atomic work must
use the pooled driver.

**Local database.** `docker-compose.local.yml` runs Postgres plus the Neon
proxy (host ports 54322 and 4444, so it does not collide with another
project's Postgres):

1. `pnpm db:local:up`
2. `pnpm db:local:migrate` (drizzle-kit cannot reach the proxy; this runs the
   committed migrations through the app's own pooled driver)
3. run the app with `NEON_LOCAL_PROXY=1` and
   `DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/main`
4. `pnpm db:local:down` stops it; the data volume stays.

With `NEON_LOCAL_PROXY=1`, both drivers go through the proxy for the
`db.localtest.me` host only (`configureLocalProxy` in
`packages/db/src/index.ts`). The unit tests do not need it: they use PGlite.

## Schema domain model

Decisions baked into the schema — keep new code consistent with them:

- **Ranks.** `users.rank` is only `captain` or `member`. Every other
  "role" is _derived_, never stored: a **team lead** is derived from
  `team_memberships.is_lead`; a **driver** from
  `driver_profiles.intends_to_drive`. Do not add a stored role column for
  a derived capability.
- **`team_lead` clearance is GLOBAL, not per-team.** _(Owner-ratified
  2026-09-09: "it's a sitewide global role." Settled — do not re-open it in
  passing; a change here is a deliberate reshape, not a refactor.)_ Leading
  _any_ team in the camp's current year raises a member to the `team_lead` rung of the
  `camp_member < team_lead < captain` ladder **everywhere in the app** —
  `isTeamLead(userId)` is a single boolean and `deriveViewerRank` takes it
  as one. Team identity governs _audience_ (who a `team` / `team_leads`
  broadcast or questionnaire send reaches, which chips a roster row wears),
  never _clearance_. There is no "lead of team X may see team X's data and
  no one else's" tier, and adding one would mean re-shaping
  `deriveViewerRank`, `requireClearance` and every call site — not a local
  change. Rationale: the ladder is a single ordered scale by construction,
  the camp is 30–80 people who all camp together, and a per-team scope
  would buy privacy the camp does not ask for at the cost of a second,
  parallel authorization axis. A lead never reaches a captain-required
  surface, because `team_lead < captain` still holds.
  - **Corollary — one gate.** Captain pages and actions gate through
    `apps/web/lib/captain-gate.ts` (`captainPageGate` / `captainActionGate`
    with the rung they need). It walks the member ladder, then reads the
    real `isTeamLead()` flag. Never hand-roll a gate with
    `deriveViewerRank(rank, false)`: on a surface that requires `team_lead`
    it locks out a genuine lead.
  - Team membership and the lead flag are **year-scoped**: `cycle` is part
    of `team_memberships`' primary key and every production read filters on
    the camp's current burn year, because the owner ruled that teams and
    lead roles go fresh each year. Write them only through
    `@camp404/db/team-memberships` (`assignTeam` / `removeTeam` /
    `setLead`), which stamps `currentCycleNumber()` itself; never insert
    into `team_memberships` directly, or the row lands on the `DEFAULT 1`
    sentinel and is invisible to every production read. `setLead` refuses a
    non-member rather than creating the membership, and removing a team's
    last lead is allowed — a leaderless team is a legitimate state (every
    team is leaderless the moment the camp rolls over).
  - **The audience half has one owner too.** Clearance says which rung a
    viewer stands on; it does not say which audiences they may _address_.
    That is `canSendToAudience` in `packages/core/src/audience-authz.ts`: a
    captain is unrestricted, a team lead may send only to a single `team`
    scope they themselves lead, and everything wider — `everyone`,
    `team_leads`, `drivers`, `individual`, `opt_in` — is refused
    (fail-closed on an unknown rank or a missing team). It is pure and
    tested, and LIVE on two send paths. Questionnaire sends
    (`sendAction` and `previewAudienceCount` in
    `apps/web/app/(console)/captains/questionnaires/actions.ts`) gate in two moves:
    `gateAuthor()` for the rank (>= `team_lead`), then this function for the
    specific audience. The Send page offers a lead only the team scope, for
    the teams they lead. Team announcements let a lead publish (and pin) only
    to a team they lead. The action's check answers the screen; the write
    reads the sender's rank and lead teams again inside its own transaction
    and locks those rows (`lockSenderReach` in `packages/db/src/broadcasts.ts`),
    so a demotion between the check and the write cannot slip through. Never
    pass the write a list of teams from the caller. Both moves are the
    safety property: the rank gate on its own would put every member one
    message away from the whole camp. Publishing, closing and reminding a
    questionnaire stay captain-only. Change the rule in that function, never
    at a call site.
- **Blocking gates.** `required_actions` is the one generic table for
  "what blocks this user". The app routes a user to their first pending
  blocking action. A bespoke feature satisfies its own row by flipping
  `status` to `completed` when it writes its domain table. A new blocking
  requirement is a `required_actions` row — never an ad-hoc `redirect()`.
  Every member page walks one ladder, `requireMemberPage` in
  `apps/web/lib/member-gate.ts`: invite, blocking questionnaire, burner
  profile, captain approval.
- **Questionnaires — two classes.** _Code questionnaires_ (`burner_profiles`,
  `dietary_requirements`, `driver_profiles`, …) are bespoke coded pages
  writing into their own distinct domain tables — keep these as-is.
  _Builder questionnaires_ are authored in-app via the captain questionnaire
  builder: their definitions live as data in `questionnaire_definitions` and
  their answers in the one generic `questionnaire_responses` store (JSONB
  keyed by field id). Both classes dispatch through
  `questionnaire_activations` and gate through `required_actions` — the
  shared, key-driven spine. The generic def+response pair is a deliberately
  _scoped_ exception to "bespoke over generic" (below), for camp-authored
  forms only.
- **Notifications.** `broadcasts` are composed messages fanned out by a
  worker into per-user `notification_deliveries` (a queue). `push_tokens`
  holds device tokens.
- **Component mapping.** String keys (`required_actions.action_key`,
  `questionnaire_activations.questionnaire_key`, `broadcasts.ref_type`)
  map to bespoke components via a code-side registry — the DB stores the
  key, never the component.

**Bespoke over generic.** Features get distinct domain tables and bespoke
components — no CMS, no dynamic content engine, no generic response store.
This is a deliberate product stance; prefer a new table and a new
component over a configurable abstraction. **One scoped exception:** the
captain questionnaire builder is a deliberately bounded dynamic content
engine (generic `questionnaire_definitions` + `questionnaire_responses` +
a data-driven runner) for camp-authored questionnaires. It does not
license genericizing any other feature.

## Environment variables

When adding an env var, update **both** `.env.example` **and** the
`globalEnv` list in `turbo.json`. Miss the latter and Turbo's cache won't
invalidate when the var changes, causing stale builds.

## Mobile builds

The web app is statically exported and wrapped by Capacitor (`build:mobile`,
`MOBILE_BUILD`). Server-only features — route handlers, server actions —
do not exist in the mobile build. Anything a mobile screen depends on must
work client-side or call a separately deployed API.

**Status: `pnpm --filter @camp404/web build:mobile` is currently broken
and deferred to Phase 7.** Next 16 tightened `output: "export"` so every
route handler / dynamic page in the bundle has to be statically
pre-renderable. Every page in this repo today reads cookies via
`getAuthenticatedUser()` and every `/api/*` route is server-only —
so even the planned fix (a `pageExtensions` gate that excludes
`*.server.{ts,tsx}` from the mobile build) would just produce an empty
shell at this point. Revisit once there's a client-side mobile screen
that actually has something to ship.

## AI providers

Model IDs (Claude Opus 4.8, Haiku 4.5, Groq Whisper Large v3 Turbo) and the
prompt templates in `@camp404/ai-prompts` are pinned and versioned
deliberately. Do not swap models or edit a prompt in place — bump the
version instead.

## Cron jobs

All `/api/cron/*` routes require `Authorization: Bearer ${CRON_SECRET}`.
`apps/web/vercel.json` schedules seven, daily (UTC): `maintenance` 07:30,
`recipes/analyse` 08:00, `manuals/generate` 08:30,
`notifications/reminders` 09:00, `notifications/dispatch` 09:15,
`notifications/push` 09:25, `notifications/email` 09:35.

- `maintenance` is where data upkeep lives instead of an operator script:
  it encrypts any leftover plaintext ID number, and (on the production
  deployment only) deletes avatar folders whose owner has no camp account.

- A job must be honest on the cron dashboard. A run with failures answers
  non-2xx; a job that is not built answers `{status: "stub"}` from
  `apps/web/lib/cron-stub.ts` (recipes and manuals today), never
  `{ok: true, processed: 0}`.
- `apps/web/lib/__tests__/cron-stub.test.ts` checks that every scheduled path
  has a route and every route is scheduled, except `telegram/dispatch`: it is
  off on purpose (Telegram outbound stays off until the owner turns it on, see
  `DEFERRED.md`) and answers `status: "not_configured"` without a bot.

## Conventions

- TypeScript throughout; shared types and Zod schemas live in
  `@camp404/types`. Validate external input at the boundary with Zod.
- Lint via `@camp404/eslint-config`; format via Prettier (`.prettierrc.json`).
- Prefer editing existing files; do not add files or abstractions a task
  doesn't need.
- Add or update tests with behavioural changes. Vitest covers units, and
  PGlite (`packages/db/src/__tests__/_harness.ts`) covers real queries.
  Playwright e2e in `apps/web/tests/e2e` is live: the `e2e` job in
  `.github/workflows/ci.yml` runs it on every source PR against `next dev`
  with `E2E_TEST_MODE=1`, and `ci-pass` needs it, so a failure blocks merge.
  (Owner's call on decision D-A, 2026-09-16.)
- A privileged write to another member's data, or to camp config, writes an
  `audit_log` row through `writeAuditEvent` (`packages/db/src/audit.ts`) in the
  SAME transaction as the change. An audit row that can commit without its
  change, or miss it, is worse than none.
- A decision write is a compare-and-set: its `WHERE` names the status it
  expects to change (for example `approval_status = 'pending'`), and
  `.returning()` tells the caller whether it won. A lost race returns a
  sentence the user can act on, never a silent overwrite. See
  `setUserApproval` and `decideCaptainPromotion`.
- A failed change is reported one way on every captain screen. A problem with
  what someone typed, in a form or a dialog, shows inline beside it. A one-tap
  change on a list row (move, archive, delete, tick) reports its failure as a
  toast, and only the control that was used spins. See
  `announcements-manager.tsx` and `team-settings-manager.tsx`.
- When a doc and the code disagree, fix the doc in the same PR, or mark the
  line `[CORRECTION <date>]`. When only the owner can settle it, mark it
  `[UNRESOLVED <date>]` and say what the choice is.

## Verification

Most expensive mistakes have one shape: a plausible belief, stated as fact,
never measured.

- **Measure before you claim.** Before you write "this is because…", run the
  thing that would show it: a `git log`, the failing test alone, two
  timestamps.
- **Attribute before you blame.** A failing test on your branch is not
  automatically yours, and not automatically a flake. Run it on `main`, and
  run it alone.
- **A test that cannot fail proves nothing.** After you write a regression
  test, break the code on purpose and watch it go red.
- **A test that passes for the wrong reason is worse than none**, because it
  is counted. Two shapes:
  - **An absence asserted against a page that has not rendered.**
    `toHaveURL` resolves before the page paints, so `toHaveCount(0)` right
    after it passes on an empty document. Assert something that is PRESENT
    first (a heading), then the absence. The absence checks in
    `camp-settings.spec.ts` do this.
  - **A fixture value outside the domain vocabulary.** TypeScript guards the
    enums in `_factories.ts`, but not the plain `text` columns:
    `audit_log.action`, `questionnaire_key`, `definition_key`. A fixture with
    `action: "member.approve"` where the code writes `"member.approved"`
    matches nothing, and the test goes green for the wrong reason. Seed from
    the constant the code uses, and check that the fixture moves the result:
    seed the opposite case and watch the assertion change.
- **Report what happened.** If a step was skipped, say so. If something is
  not verified, say which part.

## Security / POPIA

- Passport numbers, SA ID numbers, and bank/account details are
  column-level encrypted with AES-256-GCM (`packages/db/src/crypto.ts`, keyed
  by `PGCRYPTO_KEY`; the column comments still say pgcrypto, the original
  plan). Encrypt at the write boundary — never store these plaintext.
- Never store passport images, credit card numbers, or CVVs.
- Account deletion sanitises to a `Lost Cat #N` stub to preserve
  relational integrity. See `docs/brief.md`.
- No `PGCRYPTO_KEY` rotation is planned (owner's call, 2026-09-16). A stored
  value has no key id, so after a key change the old ciphertext cannot be
  read: the app shows it as unreadable and cannot recover it. Do not change
  the key in any environment that holds real data.
- **Privacy classes** are enforced on the server in `@camp404/core`
  (`packages/core/src/privacy.ts`), never only in the UI:
  - `ALWAYS_PRIVATE`: ID and passport numbers, bank details. Never shown to
    another member. Captains read an ID only through audited paths: the
    member panel in camp-management and the member export.
  - `SAFETY_VISIBLE`: emergency contacts, allergies, anaphylaxis. Private,
    but readable by the member, captains and any team lead (owner's call,
    2026-09-16), because withholding them in an emergency is the worse
    failure. The capture pages name that audience (`MEDICAL_AUDIENCE_NOTE`).
  - `MEMBER_FIELD_READERS` names the lowest rank that may read each member
    column; a member always reads their own. `schema-invariants.test.ts`
    fails when a member-data column has no entry. Captain notes are
    deliberately not in it: the member must not read them.
- **Reads of private data are recorded.** Opening a member's ID document,
  their safety data or captain notes writes an `audit_log` row after the
  response (`auditReadAfterResponse`: never blocks the read, logs if it
  fails). A member export writes its row BEFORE the file and fails closed.
- **A record, not monitoring.** The audit rows answer "who saw my data?" and
  let an incident be rebuilt. Do not add volume thresholds, per-person
  profiling or alerts on top of them. Reading many members' safety data in
  one sitting is ordinary care, and flagging it teaches captains that the
  tool watches them.

## Git & pull requests

- Work on feature branches; never force-push a shared branch.
- Commits follow Conventional Commits, `type(scope): subject`, checked by
  commitlint (`commitlint.config.mjs`): a husky `commit-msg` hook locally and
  the `commitlint` CI job on PRs. Types come from this repo's history
  (`design` included); scopes are free, lower-case kebab-case; the header
  is 120 characters at most. The subject says _why_, not just _what_.
- One PR per feature. The PR template leads with **Why** and **Decisions**;
  fill in Database even when the answer is "None."
- Keep the CI gate green before requesting review. `ci-pass` is the one
  required check.

## Before you commit

Run the full CI gate locally — `pnpm turbo run lint typecheck test build` —
and make sure it passes. This is exactly what `.github/workflows/ci.yml`
runs on every PR.
