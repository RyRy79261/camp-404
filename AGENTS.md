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
  web/        Next.js 16 app (App Router, React 19, Tailwind v4): the 404 OS console
  join/       join.camp-404.com: the "404 OS" recruiting site; reads the db, no sign-in
  mobile/     Capacitor host wrapping the web static export
  admin-cli/  Node CLI for data ops
packages/
  core/       Framework-free domain logic: access, privacy, redaction, … (@camp404/core)
  ui/         Shared shadcn/ui components (@camp404/ui)
  os/         The 404 OS window engine, shared by web and join (@camp404/os)
  games/      The desktop's games and cats (@camp404/games)
  db/         Drizzle schema + migrations (@camp404/db)
  auth/       Self-hosted Better Auth server and client (@camp404/auth)
  types/      Zod schemas + shared TS types (@camp404/types)
  telegram/   Bot client and handlers; outbound built but off (@camp404/telegram)
  ai-prompts/ Versioned prompt templates (@camp404/ai-prompts)
  eslint-config/ typescript-config/
```

`pnpm-workspace.yaml` is the source of truth. Each app and most packages have a
short README; `docs/architecture.md` draws how they fit together.

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

Traps that already cost real time:

- **PGlite has one connection.** The db integration tests
  (`packages/db/src/__tests__/_harness.ts`) back every driver with one
  in-process Postgres. A `createHttpDb()` query issued while a
  `withTransaction` callback is still open waits forever (a test timeout),
  though production would use a second connection. Fix the code, not the
  test: pass the `tx` down, or read after the transaction returns. Green on
  PGlite is not proof of Neon pooling or cold starts.
- **E2E runs on the in-memory test store.** Playwright runs the app with
  `E2E_TEST_MODE=1`, and `apps/web/lib/test-store.ts` stands in for the login
  and the database. [CORRECTION 2026-09-29] This said Playwright starts
  `next dev`. That is the local default only: CI builds the app and serves it
  with `next start` (`E2E_SERVE_BUILD=1`). `tests/e2e-db` runs the specs the
  store cannot hold against a real Postgres. A data function with no test-store twin cannot be driven
  by Playwright. Add the twin with the feature, or say in the PR that the flow
  has no E2E cover.
- **A `"use server"` file may export only async functions.** A `const`
  export breaks the page under `next dev`, and neither typecheck nor lint
  catches it. Put shared constants in a plain module.
- **No `loading.tsx` under `app/(console)/`, and no Suspense around a
  window.** Three reasons, each found the hard way. A page below one that
  calls `notFound()` answers 200, and its `redirect()` happens in the browser
  instead of on the server. And the chrome's `next/link`s hydrate before the
  streamed page arrives, so React client-renders the page and leaves the
  server's copy behind in a hidden `<div id="S:0">`: the page is in the DOM
  twice (invisible, but a Playwright `getByLabel` sees two).
  [CORRECTION 2026-09-26] This named the console header's links and the nav
  item's pulse; the header is gone (PR C, the 404 OS desktop). The pressed
  icon, taskbar button or window title blinks instead (`pendingKey` in
  `components/os/desktop-shell.tsx`, a `useTransition` round the desktop's
  own `router.push`).
  **What is allowed (2026-09-27): a `<Suspense>` INSIDE a page, below its
  gate.** The page's own body runs every gate, `notFound()` and `redirect()`
  first and draws its `PageHeading`; only then may it wrap a slow part that
  decides nothing (a Google Calendar read, a long list, audit rows) in
  `<Suspense fallback={<Skeleton… />}>` around a child async server
  component that takes what the gate returned as props. Never a boundary
  above the gate, around the whole page or around a window, and never a
  `loading.tsx`. `/calendar` and `/captains/audit` do this;
  `tests/e2e/streamed-pages.spec.ts` checks each one: signed out is still a
  server 307, a `notFound()` page is still a 404, and the h1 is in the DOM
  once with no hidden `S:` copy. Add a new streamed page to its list. The
  window itself opens at the click with a skeleton body
  (`WindowSkeleton` in `components/os/last-seen-view.tsx`) until the page
  commits, so no server boundary is needed for that feedback.
- **Only one window body is ever mounted.** The console is the 404 OS
  desktop (`components/os/desktop-shell.tsx`): the URL is the focused window,
  and the page for it renders live inside that window. Every other open
  window is a frozen copy of how it last looked, plain HTML in a CLOSED
  shadow root, `inert` and `aria-hidden` (`@camp404/os` `last-seen.ts`).
  Playwright, `getByLabel`, screen readers and Tab see one page only; a
  background frame is no landmark and has no tab stops (the taskbar is the
  keyboard's way to it). Mark anything private in a page with
  `data-os-private` (ID numbers, safety data, captain notes, two-factor
  secrets) so the copy blanks it; `private-marker-drift.test.ts` fails when a
  console component names an `ALWAYS_PRIVATE` or `SAFETY_VISIBLE` field
  without it. Password and one-time-code fields (by type or `autocomplete`)
  are always blanked. A copy keeps what the member typed into a controlled
  field (React mirrors it into the `value` attribute), so it lives in memory
  only and is dropped on a change of manifest version (what the member may
  open, never a count).
- **Never `prefetch={true}` or `router.prefetch()` on a program URL.** A full
  prefetch renders the page on the server with no click: it marks the inbox
  and announcements read, runs `resetStaleRuns` and kicks due work. The
  default `<Link>` prefetch is fine (no `loading.tsx`, so it renders no
  page). `components/os/__tests__/desktop-items.test.ts` and
  `packages/os/src/prefetch-guard.test.ts` fail on one.
- **A window's title bar is not a heading.** The page's `PageHeading` h1 is
  the only heading, so `getByRole("heading")` never matches twice. A window
  frame is a labelled region (a `section` with
  `aria-roledescription="window"`), never `role="dialog"`, so
  `getByRole("dialog")` still means a Radix modal.
- **Any action that changes rank, teams, lead flags, approval, a gate or the
  cycle calls `revalidateManifest()`** (`lib/manifest-revalidate.ts`), or the
  acting member's desktop keeps icons they no longer have (the layout stays
  mounted across navigation). Other members catch up on a hard load, a tab
  back after five minutes, a Back or Forward, a gate redirect, or a page that
  renders a `CaptainLock`; until then their background copies stay.
- **Phones are CSS, not a screen check.** Below `md` the desktop is a home
  screen, full-screen windows and a bottom bar; every phone piece is
  `md:hidden` and every desktop piece `max-md:hidden`, so the server's first
  paint is right at 390 px. Never switch layout on `usePhone()` (the server
  cannot know the width, so the page would flip after hydration); read
  `matchMedia(PHONE_QUERY)` only inside an event (dragging, Back). jsdom draws
  no CSS, so a unit test sees both the phone's and the desktop's chrome:
  scope a query to one (`getByRole("toolbar", { name: "Taskbar" })` or
  `[data-os-phone-home]`).
- **Unsaved input goes through `useWindowDirty`.** A page with a form a
  member could lose registers it (`@camp404/os`), so close, minimise, a switch,
  a launch, a link inside the window and a page unload ask first, and a Back
  (which cannot be asked about) keeps the draft in memory for that window. The
  four long-text editors (meeting, meal plan, recipe source, announcements
  composer) go through `components/os/editor-draft.tsx`; the meeting editor
  and the composer also autosave to `sessionStorage` and restore with
  "Unsaved changes restored". The two Kitchen editors pass `restore: false`
  (the guard only) until the owner approves the restored note inside a
  Kitchen page. Nothing else may store a draft in the
  browser (My forms, the burner profile and the runner hold safety data).
  Never hand-roll a leave guard on document clicks: taskbar buttons and
  frames navigate with `router.push`, which such a guard never sees.
- **A blocking questionnaire draws over an inert desktop, but the gate is
  still the server's redirect.** `requireMemberPage` sends every member page
  to the runner, except the two that gate on camp access alone (the inbox,
  `/notifications`, and an announcement, `/announcements/[id]`, reached from
  a push or email link). The blocking layer holds only the runner and its
  `/complete` page; a held member on those two gets the page bare, as before
  the desktop (`desktop-shell.tsx`). The held desktop is a picture. Never add
  a live field (counts, pins, badges, Today, copies) to the held manifest,
  and never let the layer decide who is held.
- **"branches limit exceeded" in the `schema-migration` job is capacity, not
  code.** Each run makes a Neon branch; several stacked PRs pushed together
  hit the project's limit. Re-run the failed job.

## Design

**The look is the AfrikaBurn contributors app's organiser console** (owner's
call, 2026-09-17): a desktop dashboard with a sticky header and nav, AfrikaBurn's
tokens and kit, and Camp 404 magenta as the accent skin. The earlier Pencil
boards are gone (the `design/` folder was deleted, owner 2026-09-25: "its
completely deprecated"); do not keep a phone-only layout because a board drew
one. For a new surface, copy the composition of
AfrikaBurn's nearest equivalent (`apps/org/app/(console)/**` in that repo) and
restyle only with tokens; do not invent a design.

[CORRECTION 2026-09-26] **The look is the 404 OS Classic desktop** (owner's
pick 2026-09-25, and his approval of the prototype 2026-09-26: "the
approved prototype IS the design"). The prototype is
`apps/join/app/prototype/captain-desktop` in the owner's checkout (variant A);
match it, do not re-derive it. Join's palette (midnight violet
`oklch(0.15 0.05 295)`, magenta `oklch(0.65 0.27 340)`, electric blue
`oklch(0.62 0.18 255)` and the panel, chrome and line mixes) through the
`--os-*` variables, Silkscreen for the chrome and Inter for body text
(decision 10), the CRT surface (grid, scanlines, noise, beam) and the glitched
"404 OS" wordmark with the year under it on the wallpaper. The AfrikaBurn kit
stays as the parts, re-coloured inside the desktop: `data-os-skin` on the
desktop, the blocking form's page and the gate screens turns the kit's tokens
into the OS palette, square (`apps/web/app/globals.css`). For a new surface,
copy the nearest existing program's window composition and restyle only with
tokens (decision 12 A); do not invent a design. The AfrikaBurn rule above is
the record of the 2026-09-17 call.

**Games and cats live in `@camp404/games`** (owner, 2026-09-26). The desktop's
two cats are Jinn (all black) and Prince (white, with a black cap, back patch
and tail, asleep on the taskbar clock), and Shadow Work (the camp's art piece;
never "the lamp") sits at the bottom of the Teams folder with Jinn on it.
`@camp404/os` never imports a game (its package.json has no games
dependency). Join imports only `@camp404/games/inkblot` and
`@camp404/games/inkblot/art` (`apps/join/lib/games-boundary.test.ts`
fails on any other). The web app loads the rest lazily, through
`components/os/desktop-cats.tsx`. Easter eggs are never labelled: a cat or the
art piece is a toy for the pointer, hidden from assistive tech and out of the
Tab order, with no name, hint or instruction anywhere in the UI; the
keyboard's way to them is the Terminal.

- **The signed-out landing page (`apps/web/app/landing-hero.tsx`) is NOT part
  of the restyle** (owner, 2026-09-23: the AfrikaBurn look is for "the
  components and the dashboards, not the landing page"). It keeps Camp 404's
  own glitch design and sets its original palette and font on itself. Do not
  recompose it after an AfrikaBurn page.
- Tokens: `packages/ui/src/styles/globals.css` (AfrikaBurn's file plus the
  `.camp-accent` skin on `<html>`). Montserrat, dark-first: `<html>` carries
  the `dark` class in `app/layout.tsx`. [CORRECTION 2026-09-26] Those stay
  for the sign-in pages only (decision 5 A). Everything with `data-os-skin`
  on the page (the desktop, the held form's page, `GateScreen`, the invite
  gate) wears the 404 OS skin from `apps/web/app/globals.css`: while a
  marker is on the page `<html>` carries `os-skinned` (a script in the root
  layout's head keeps it in step, `lib/os-skin.ts`), and `:root.os-skinned`
  points the kit's tokens at the `--os-*` palette, zeroes the radius
  variables and sets Inter, so Radix popovers and toasts portalled into
  `<body>` wear it too. Never key a rule on `:root:has(...)`: Chrome then
  restyles the whole document on every DOM change (3x the style work of a
  window switch, measured 2026-09-26). The OS's own classes (surface,
  wordmark, window power-on, slide-in) are in `packages/os/src/styles.css`;
  a kit part the skin restyles further carries a `data-slot` (badge, button,
  card, card-title, page-title, page-eyebrow, label, field-label,
  filter-chip, progress, toast) or `data-kpi` (a headline number tile), and
  the skin draws it as the prototype's kit does.
- Shell: `apps/web/app/(console)/layout.tsx` draws the header and the nav,
  filtered by rank on the server (`lib/console-nav.ts`): a few links, then the
  Teams, Camp, Me and Captains menus (Teams read from camp settings), folded
  into one "Menu" sheet below `md`. A new page goes into a menu there. E2E
  specs reach the nav through `tests/e2e/lib/console-nav.ts`. A page starts with
  `PageHeading` (`@camp404/ui/components/page-heading`) and owns no container.
  [CORRECTION 2026-09-26] The header and nav are gone (PR C). The layout
  draws the 404 OS desktop (`components/os/desktop-shell.tsx`) from the
  member's program manifest, built on the server (`lib/programs.ts`,
  `lib/program-manifest.ts`): icons, folders, team folders, the Start menu
  and the tray. A new page gets a row in `lib/program-routes.ts` (which
  window its URL opens, and its plain title in `PROGRAM_TITLES`) and an
  entry in `PROGRAM_REGISTRY` in `lib/programs.ts` (its icon, folder and the
  same rank bar as its page gate); `program-registry-drift.test.ts` and
  `program-routes.test.ts` fail until both exist. A page still starts with
  `PageHeading` and owns no container: the window pads it. A window can be
  470px wide on a wide screen, so a page lays itself out by its WINDOW's
  width: use the kit's `page-sm:`/`page-md:`/`page-lg:`/`page-xl:` variants
  (`packages/ui/src/styles/globals.css`; the same widths as `sm`…`xl`) for a
  page's own scaffolding (the heading row, its column split, a table's switch
  to cards). They measure the window's body (`data-page-container`) and fall
  back to the screen outside one. Plain `sm:`…`xl:` still ask the screen;
  a dialog or popover (portalled to `<body>`) keeps them. The E2E helper
  `tests/e2e/lib/console-nav.ts` drives the Start menu and folder windows on
  a desktop and the home screen and folder sheets on a phone
  (`openConsoleNav(page, "Captains")` opens the Captains folder; on a
  desktop the Start menu lists the Captains and Kitchen programs as groups of
  their own, and a team folder opens from its desktop icon); it also
  has `expectDesktop` (something present before an absence on `/`),
  `openToday` (the member's summary is behind the closed Today handle; it is
  on every screen now, over the windows),
  `desktopIcon` and `osWindow`. The shell's own cases are
  `tests/e2e/os-shell.spec.ts`; the held desktop and the builder's leave
  question need the questionnaire engine and are in
  `tests/e2e-db/desktop.spec.ts`.
- Loading: no `loading.tsx` in the console (see the gotcha under Commands);
  the pressed nav item pulses while the next page renders. [CORRECTION
  2026-09-26] The pressed icon, taskbar button or window title blinks
  (`.os-pending`) while the next page renders. [2026-09-27] A program not yet open gets
  its window at the click, with a skeleton body, and its taskbar button; an
  open one comes to the front at once; the desktop wears a busy cursor
  (`aria-busy` on `#os-desktop`). Streaming inside a page, below its gate, is
  allowed (the gotcha under Commands).
- System themes (issue #290): every colour the desktop's chrome and a window
  read is a variable in `apps/web/lib/os-themes.ts`, one set per theme
  (404 Night, Calm, High contrast, Colour-blind safe). A new colour is a new
  token in every theme, never a literal in a component; the drift and
  contrast tests (`lib/__tests__/os-themes.test.ts`,
  `os-skin-contrast.test.ts`) hold each theme to it. High contrast and Effects
  off take decoration out of the DOM, not just out of sight. The landing page,
  Join and the sign-in pages are never themed.

Three rules from the design audit of 2026-10-01, each with its shared
building block in `packages/ui`:

- **A table fits its window.** A program window is narrower than the screen,
  so a table never switches on `md:`/`lg:`. Use `ResponsiveDataTable`: it
  switches to AfrikaBurn's stacked cards by its OWN width (a container query,
  `stackBelow`), and its `TableFit` guard also stacks a table that would still
  run past its box. Never a table scrolled sideways with its buttons out of
  sight. Text columns wrap (or `truncate` with the full text as a tooltip);
  the `role: "actions"` column keeps its own width on the right. Pass
  `framed` for the card frame; do not wrap it in a `page-md:` frame.
- **Read-only is content, not a disabled form.** A viewer who cannot edit sees
  the values, never greyed inputs, a greyed Add button or dead row icons:
  render no control at all, show a read-only form as a `FieldList` (label over
  value, the edit form's columns, `components/field-list`), and say who edits
  once, in the page description or one quiet `EditorsNote` line, not a lock
  banner. The server still refuses the write.
- **The main button stays put.** A row's buttons go in `RowActions`
  (`components/row-actions`): one `primary` action, the same variant on every
  row (only its words may change), then quiet ghost icons in a `secondary`
  slot that keeps its width (`secondarySlots`) even on rows that have none.
- **Long text is never a raw Markdown textarea** (owner, 2026-10-01). Use
  `MarkdownField` (`apps/web/components/markdown`): the WYSIWYG Markdown
  editor with its preview beside it, Write | Preview tabs in a narrow window.
  The meeting notes use it.

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
  public repo and each preview's Neon branch starts as a copy of production's
  data. `authMayServe` is the one switch; do not add a second.
  [CORRECTION 2026-09-24] This line used to say previews share the production
  database. The owner says each preview gets its own Neon branch
  (`preview/<branch>`, made by the Vercel Neon integration and deleted by
  `neon-pr-cleanup.yml`).
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
  scope); a renamed project or scope needs that pattern changed. What the
  proxy secret opens, beyond signing in as any member on a preview: anyone
  who can deploy a preview holds it, so they can seal a state naming their own
  preview and have production swap a member's Google code and send the sealed
  profile there, with the Google access and ID tokens (`openid email profile`,
  one hour). A preview sign-in is also not bound to the browser that started
  it (Better Auth skips the state-cookie check on `/oauth-proxy-callback`), and
  the sealed profile rides in the preview's URL. Vercel Authentication on
  previews narrows all three, and also means only someone signed in to Vercel
  can finish a Google sign-in on a preview inside the plugin's 60 seconds.
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

**Two branches that both add migrations collide on the numbers.** When a
branch rebases onto one whose migrations merged first, delete the branch's own
unmerged migrations and regenerate them after the new last one. Never rename
them into place: the migrator skips an entry whose journal `when` is older
than the newest one applied, so a renamed migration never runs in production
and no error says so. `migration-journal.test.ts` fails on it.

**One-off data fixes are migrations too.** `vercel-build` runs
`db:migrate` before `next build`, so a data fix written as a custom migration
(`pnpm --filter @camp404/db db:generate --custom --name <name>`, then fill in
the SQL) runs on the next deploy. Never ship a fix that needs someone to run a
CLI or SQL command against production by hand. Make it idempotent (`ON
CONFLICT DO NOTHING`, `WHERE ... IS NULL`) and test it on PGlite.

A **guard migration** is the same mechanism with no data change: a custom
migration whose only job is to stop the deploy (`RAISE EXCEPTION`) when live
data would break the next migration, for example a `CHECK` that stored rows
would fail (`0050_money_in_rands_only_guard.sql`). Generate it with `--custom`
like a data fix, never write the file by hand, say in the error what to do,
and test on PGlite that it passes on clean data and stops on bad data.

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
  `recipe_proofread_runs_open_plates_idx`,
  `questionnaire_activations_one_open_per_key_idx`,
  `notification_deliveries_broadcast_user_uniq`, `dues_charges_one_fee_idx`,
  `afrikaburn_deadlines_cycle_kind_uniq`,
  `payment_refunds_one_live_idx`. A bare `ON CONFLICT DO
NOTHING`, with no target, is not affected.

**Driver choice.** `@camp404/db` exposes two drivers: `createHttpDb()` is
stateless, for route handlers and server components, and has **no
transactions**; `createPooledDb()` is a WebSocket pool, for background work and
the CLI, and **supports transactions** (`withTransaction` opens one).
[CORRECTION 2026-09-29] This said "cron jobs"; there are none (see No cron
jobs). Multi-statement atomic work must
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
  - **The Kitchen's recipe review is the other place team identity decides
    what a lead may do** (owner's flow for #243, 2026-09-23: "A Kitchen team
    lead or a captain approves it"). `canApproveRecipe` in
    `packages/core/src/recipes.ts` lets a captain or a lead of the `kitchen`
    team approve, reject or ask for changes, retype the text, edit a
    recipe's source and accept an older draft of Claude's; a lead of any
    other team is refused. Clearance is still global: the rank gate is
    `captainActionGate("team_lead")`, and this is not a data tier (every
    member reads the recipe book), only who may act on the Kitchen's review.
    The write re-reads the actor's rank and lead teams inside its own
    transaction. [CORRECTION 2026-09-24] Sending a recipe to Claude is no
    longer captain-only: the owner's decision 2A gives it to the same people
    (`canRunProofread`, which takes the led teams). [CORRECTION 2026-09-24]
    There is no daily limit on sends (the owner removed it). The same people
    edit the year's meal plan (`canEditMealPlan`). [CORRECTION 2026-09-24]
    There are no kitchen settings any more (the owner removed the largest
    pot and the burner count), so `canSetKitchenSettings` is gone. Change the
    rule in those functions, never at a call site.
  - **A team's program is another place team identity decides** (owner's
    ruling 1, 2026-09-27): only a captain or a lead OF THAT TEAM changes what
    a team's program says (its description today), by
    `canEditTeamProgram` in `packages/core/src/team-programs.ts`, which fails
    closed. Every member
    reads every team's program. The write re-reads the actor's rank and lead
    teams inside its own transaction. Meeting notes keep their own, wider
    rule (`canWorkInTeam`: the team's members this year). Change the rule in
    that function, never at a call site.
- **Blocking gates.** `required_actions` is the one generic table for
  "what blocks this user". The app routes a user to their first pending
  blocking action. A bespoke feature satisfies its own row by flipping
  `status` to `completed` when it writes its domain table. A new blocking
  requirement is a `required_actions` row — never an ad-hoc `redirect()`.
  Every member page walks one ladder, `requireMemberPage` in
  `apps/web/lib/member-gate.ts`: invite, blocking questionnaire, burner
  profile, captain approval. **One deliberate exception: `/notifications`**
  (owner, 2026-09-30) checks only camp access, so a member who is not
  approved yet still reads their own inbox, including the forms they owe. It
  shows nothing of anyone else's, and captain requests stay hidden from an
  unapproved member. Do not "fix" it onto the ladder.
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
- **Who is coming this year.** `camp_participations` is each member's
  per-year place: one row per member per burn year, its `status` set by the
  member's answer to the `participation_intent` question (Yes → `applied`,
  Maybe → `maybe`, No → `not_attending`) and by a captain's one-tap Accept /
  Waiting list on the roster, a compare-and-set on the status the captain saw.
  It is year-scoped, adopted by `setFoundingYear`, and gates nothing yet: a
  member who says No or Maybe keeps full use of the app and every audience.
  The status reads at `team_lead` (a lead sees it on the roster, read-only);
  a plain member reads only their own. `intent` keeps the member's own last
  answer apart from `status`, so an accepted member who said Maybe reads
  back Maybe; My forms edits that answer, and the same write rewrites the
  answer stored with the "Coming this year?" questionnaire so its results
  agree with the roster. Erasure deletes every year's row.
- **The member's answer and the captains' decision are two things** (owner,
  2026-09-28). "Coming" / "Maybe" / "Not coming" is what the member said
  (`intent`); "Accepted" (on the camp's list this year) and "Waiting list"
  (said Coming, but the camp is full) are the captains' decision. The stored
  `status` still holds both; screens split it with the helpers in
  `packages/core/src/participation.ts`, exported from `@camp404/core` (`INTENT_LABEL`, `participationDecision`,
  `DECISION_LABEL`, and `STANDING_LABEL` for filters and counts, e.g.
  "Coming, not decided"). Never write one label that mixes the two.
  `intent` reads at `team_lead`, like `status`, so a lead sees both halves.
- **Tickets, DDT and WAP.** `camp_tickets` (#238) is the same shape: one
  row per member per burn year (adopted by `setFoundingYear`, which merges a
  member's sentinel row into one they already have for the founding year,
  the founding year's non-default values winning; erased with the account),
  written only through `@camp404/db/tickets`. Who reads what (owner,
  2026-09-28): a member reads their own row only (ticket status, DDT and WAP,
  under "This year" on their profile) and sets only their own ticket status;
  captains read every member's ticket data, may set a member's ticket status
  for them, and alone set the DDT (direct distribution ticket) and the WAP
  (work access pass). A ticket status, by the member or a captain, is only
  for someone who said Coming or Maybe (`mayRecordTicket`); the DDT and WAP
  are not bound by it. Each captain change is a compare-and-set on the value
  they saw, audited as `ticket.pass_changed`. In code they are
  `ddt` and `wap`; the Postgres columns keep their first names
  (`directed_ticket`, `early_entry`) so the rename needed no migration. A team
  lead reads none of it, and a member's own read carries only their own row.
  No row means every column's default. It stores no ticket number,
  barcode, order reference or card detail. The captains' view is
  `/captains/applications` (Applications: team lead and up, no tickets below
  captain), and the overview's "This year" card counts accepted members with
  no ticket yet and WAPs issued.
- **Shift roster (#248).** Members sign up before the burn; the roster is
  printed for site and changed there on paper, never typed back in (owner,
  2026-09-30: no internet on site). So a slot takes changes only until its
  day starts, for everyone (`shiftChangesOpen`). A shift type belongs to one
  team; a captain or a lead of THAT team sets it up (`canManageShifts`,
  `packages/core/src/shifts.ts`); cleaning is Sanitation's. Filling a place
  counts under the slot's row lock, so the last place goes to one member.
  The minimum of 3 is a reminder and a captain's nudge, never a
  `required_actions` block. The Burn days come from the logistics Burn phase.
- **Notifications.** `broadcasts` are composed messages fanned out into
  per-user `notification_deliveries` (a queue). [CORRECTION 2026-09-29] There
  is no worker: `deliverDue` fans out and drains the queue in `after()` (see
  No cron jobs). `push_tokens`
  holds device tokens.
- **Component mapping.** String keys (`required_actions.action_key`,
  `questionnaire_activations.questionnaire_key`, `broadcasts.ref_type`)
  map to bespoke components via a code-side registry — the DB stores the
  key, never the component.
- **Kitchen (recipes).** A recipe version (`recipe_versions.body`) holds the
  whole recipe as one `KitchenRecipe` (`@camp404/types`), in Noble Notations'
  `create_recipe` field names, checked by Zod on every write. Food does not
  scale by multiplying, so each plate count is proofread by Claude and stored
  per (version, plates) in `recipe_plate_counts`; a count that has a result
  is read, never run again, unless a reviewer explicitly asks for a re-run. A
  version's own count is a row there too, and a new version starts with only
  that one. [CORRECTION 2026-09-24] Nobody writes a version by hand any more:
  a reviewer edits the recipe's source (`recipe_sources`, one Tiptap document
  per section, versioned) in the editor at `/kitchen/recipes/[id]/edit`, and
  "Send for proofreading" has Claude either ask questions or write the recipe
  straight into the book, with its scaling notes shown to every reader as
  "How this was scaled". A captain or a Kitchen lead spends money (a Claude
  run, decision 2A), with no daily limit. There is no cron: a reviewer's
  click starts each run. [2026-09-24] The plates come from the year's meal
  plan (`kitchen_meal_plans` + `kitchen_meal_plan_days`, `/kitchen/meal-plan`,
  `@camp404/db/meal-plan`), not Camp settings: a recipe's plate chips are its
  distinct counts, and Claude writes a new recipe for the largest.
  [2026-10-03] The meal plan stores no dates: Day 1 and the days on site are
  read from Logistics (`campOnSite`: the first Build day, else the first Burn
  day, through the last Strike day), and a Logistics save that moves Day 1
  re-dates the prep steps and their tasks in its own transaction. A recipe
  already in the book is revised, not rewritten: the run carries its accepted
  version and the questions and answers that settled it
  (`recipeSourceRevisionPrompt`, recorded as `PROMPT_VERSIONS.recipeSourceRevision`).
  [2026-10-01] The menu (#244) sits inside the meal plan table (the owner's
  layout A, 2026-09-30): `kitchen_menu_items` holds the recipes on each meal,
  more than one to a meal, read at the recipe's book (accepted) version; the
  plates stay on the meal plan, never stored twice. The shopping list (#245,
  `/kitchen/shopping`) is worked out on each load by `buildShoppingList`
  (`packages/core/src/kitchen-menu.ts`): for each recipe on a meal, the
  `recipe_plate_counts` row for that meal's plates, added up by ingredient and
  unit and grouped by shop area. A recipe with no row for its meal's plates is
  "Not counted yet: proofread first" and adds nothing; nothing is scaled by
  multiplying. The same people as the meal plan edit the menu and the year's
  snacks (`kitchen_snacks`, a name and an amount as typed, listed last on the
  shopping list). The list's ticks (`kitchen_shopping_ticks`) are shared by
  the whole camp and any approved member ticks (`canTickShoppingList`); a tick
  keeps the amount it was given at and stops counting when the list needs
  another. No prices, suppliers, stock or allergen check on the list yet.
  [2026-10-01] **The camp does no lunch** (owner: "we dont do lunch"): meals
  are breakfast and dinner only (`MEALS` in `@camp404/types`), everywhere.
  `kitchen_meal_plan_days.lunch` is left in the table, unread, because
  production may hold values; a save keeps it as it was, and it counts
  nowhere. Dropping it is a follow-up migration. The screens follow the
  owner's approved mock-ups of 2026-10-01: a Kitchen lead or a captain edits
  the week as a table (Day | Breakfast | Dinner, a card per day on a phone)
  with a recipe picker that stays open; every other member reads the menu as
  a card per day; the shopping list is one checklist with every shop area on
  one page.

- **Camp layout (#271).** This year's site plan is one Zod-checked document
  (`CampLayout`, `@camp404/types`) saved as numbered versions in
  `camp_layout_versions`, a compare-and-set on `camp_layouts.latest_version`.
  A captain or a Structures lead saves (`canEditLayout`); every member reads.
  The neighbour page (`/neighbours/<token>`) is the one PUBLIC data page: off
  until a captain turns it on (`canShareLayout`, audited), and it reads only
  through `getSharedLayout`, which returns `neighbourView`'s allowlist (kinds
  and places, never a label or a side note) and arrival COUNTS per day. Add a
  field to it only by naming it in `neighbourView`.
- **Logistics calendar (#247).** The year's pack, travel, build, burn, strike
  and unpack days are one row per (year, phase) in `logistics_phases`. A
  captain or a Transport and Logistics lead sets them (`canEditLogistics`), a
  compare-and-set on `version`, audited; every member reads. The camp calendar
  stays on Google (owner, 2026-09-28): a phase with days is ONE all-day event.
  [CORRECTION 2026-09-30] Its title is PLAIN ("Build") and it carries no team
  tag: every phase is a whole-camp event (owner: "Build and Strike is a whole
  camp activity", then "All phases plain"), so the Calendar and Home show it as
  the camp's, not on the Transport and Logistics page. The row claims its
  event id inside the write, before Google is called, so a re-save or a retry
  never makes a second event; Google is called after the transaction. Clearing
  the days takes the event off Google. A row Google does not match yet
  (`calendar_synced_version` behind `version`) is put right by the calendar
  catch-up in `runDueWork` (on a page load, no cron), under the id it already
  owns; migration 0080 marked the phases written with the old team title.
  - **Attendance.** Every member who is coming (`isAskedForAttendance`, the
    same people as the gear rental: said Yes, or accepted) is asked Going /
    Maybe / Can't for Pack, Build, Strike and Unpack (`ATTENDANCE_PHASES`;
    not Travel or the Burn). One row per (year, phase, member) in
    `logistics_attendance`; a member writes only their own, until the phase's
    first day, a compare-and-set on the answer they saw. Every member reads
    the answers by name. Who has NOT answered is the list of who is coming,
    and `campParticipations.status` reads at `team_lead`, so a plain member
    gets the count only (`getAttendanceView` empties the names on the
    server). "Ask everyone" is the gear rental's nudge, shared as
    `openNudges`/`closeNudge` (`packages/db/src/nudges.ts`): captains only
    (`canAskForAttendance`), a `logistics_attendance` required action,
    completed once every open phase has an answer.
  - **AfrikaBurn dates** (`afrikaburn_deadlines`) live on the camp's year
    page (`/captains/camp-settings/cycle`): captains only
    (`canManageDeadlines`), a done tick, each change a compare-and-set on
    `version`, audited. [CORRECTION 2026-10-01] The page lists AfrikaBurn's
    standard dates every year (`AFRIKABURN_DATES` in
    `packages/core/src/logistics.ts`, grouped, owner's approved mock-up A),
    each "Not announced yet" until a captain sets it
    (`setAfrikaburnDate`): a row with a `kind`, at most one per year
    (`afrikaburn_deadlines_cycle_kind_uniq`), changed but never removed;
    only the second DDT round may be "No round this year" (`skipped`, no
    day). "Other" ones (no `kind`) keep the old free title and may be
    removed. A dated one is one Google event, "AfrikaBurn: <name>"
    (`afrikaburnEventTitle`), by the same mirror; a removed one keeps its row
    (`removed_at`) until its event is gone. Members read the set ones on
    Logistics, in the same groups.
- **Gear rental (#241).** The year's sleeping gear is `rental_items`; a
  member's order is one `rental_orders` row per member per year, with
  `rental_order_lines` and `rental_order_sharers`. Owner's rulings
  (2026-09-30): camp fees are separate from rental (no "camp contribution"
  line); gear comes from the camp's own stock or a supplier and BOTH have a
  price a captain sets; the member says only what they need and never picks
  the source; a captain picks it when they confirm.
  - **The tent is asked ONCE per member, by need, never once per catalogue
    tent** (owner, 2026-09-30, after seeing "2-person tent: I have my own / I
    need one" on one row). The answer is on the order (`tent_choice`): "I have
    my own" (what it is and how many it sleeps, both optional, for the site
    plan), "I need one" (for how many people), or "I'm in someone else's
    tent". A member never sees or picks a catalogue tent. **A captain picks the
    actual tent**, and its source, when they confirm; that pick is the order's
    one tent line, so the camp stock count, the on-site reserve, the summary
    and the charge all read the tent the captain picked. A tent that sleeps
    fewer than the people it is for is a warning on screen, not a refusal
    (`tentSleepsEnough`). Do not build the member's form from the catalogue's
    tents again. Every other item (mattress, sleeping bag) is still one row
    per catalogue item.
  - **Who is in whose tent has one source of truth**: the sharer list on the
    order of the member whose tent it is. "I'm in someone else's tent" names
    nobody, so it cannot disagree. A SENT order is refused when it would make
    two orders disagree (`tentConflict`): a member in someone's tent cannot
    also have their own or need one, and a sharer cannot have their own tent
    answer or be in two tents. The writer locks the member and everyone they
    name first. A draft is checked only when it is sent.
  - Camp stock is optional per item (only the camp's tents and some
    mattresses): a price AND a count on the catalogue item, together or not at
    all. It is not a link to `inventory_*`, and the Inventory has no prices
    and must not get any. A confirmation that gives out more camp stock than
    is left is refused (`priceRentalOrder`; the year's items are locked
    first), and so is a catalogue edit that would leave fewer than are given
    out. The per-item reserve is "reserved for on site", and a camp-stock
    reserve counts against the camp's stock.
  - Confirming is a compare-and-set on `submitted` AND the order's `version`,
    and writes the `rental` charge on the member's dues and the audit row in
    the same transaction; reopening cancels that charge the same way.
    "Charged" is not stored: it is a confirmed order with a live charge
    (`rentalOrderState`). A confirmed line keeps the price it was confirmed at.
  - Only a captain runs it (`canManageRental` in
    `packages/core/src/rental.ts`): this is member money data, so a team lead,
    a Finance lead included, gets nothing extra, and a member reads only their
    own order plus whose tent they are in.
  - My gear is the form (owner, 2026-09-30: not a builder questionnaire).
    **"Ask everyone"** nudges each member who is coming this year
    (`isAskedForGear`: said Yes, or accepted) and has not sent an order, on the
    gate spine: one NON-blocking `required_actions` row (`gear_order`) and one
    notice. It is a nudge, never a block; sending the order completes the row;
    pressing again reaches only those who have not answered and never stacks
    (no second notice while the first is unread). A captain may **fill an
    order in for a member** who has not answered (`fillRentalOrderFor`:
    audited, a compare-and-set on the version, marked on the order until the
    member saves it themselves).
  - Nothing here needs the app on site: tents are assigned, labelled and
    printed before the Burn (`/print/gear-rental`).
- **Team budgets and claims (#242).** Owner's rulings (2026-09-30): ONE
  budget amount per team per year (`team_budgets.amount_cents`; no "base" and
  "hoped for", no confirm switch), set by captains and Finance leads
  (`canManageMoney`). Every member reads each team's totals (budget, spent,
  left) on the team's program; "spent" is worked out, never stored
  (`budgetTotals` in `packages/core/src/claims.ts`).
  - A claim (`reimbursements`, whole cents, year-scoped by `cycle`) needs ONE
    OR MORE receipt files (`reimbursement_files`), refused with none. They
    are private blobs under `claim-receipts/<member id>/`, stored and read
    like proof of payment: `/api/uploads/claim` checks each file by its first
    bytes, `/api/claim-receipt/<file id>` streams one to the claimant and the
    Finance team only and audits every other reader. Erasure deletes the rows
    and the folder. Bank details are encrypted in `apps/web/lib/claims.ts`
    (the write boundary) and read by the Finance team one claim at a time,
    audited (`reimbursement.account_viewed`).
  - **A lead OF THAT TEAM, or a captain, says yes** (`canApproveClaim`), at
    any amount: there is no limit that needs a second approval. The approving
    lead reads who, how much, when and what for, never the receipts or the
    bank details. Then the Finance team marks it paid, or turns it down after
    all with a reason. Nobody decides or pays their own claim. Each move
    re-reads the actor inside its transaction and is a compare-and-set on the
    status, with its audit row. Change the rule in those functions, never at
    a call site.
  - A claim is made in the app only: the Claude connector lists and moves
    claims, but has no tool to make one (it cannot carry the receipts).

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

## No cron jobs

**Nothing runs on a schedule** (owner, 2026-09-24: "We're on free vercel, no
cron jobs in there"). `apps/web/vercel.json` has no `crons`, and there are no
`/api/cron/*` routes and no `CRON_SECRET`. Work happens at the user's action
or lazily on a page load, both in `after()` (`apps/web/lib/background-work.ts`):

- **At the action.** An action that writes notices (publish an announcement,
  send or remind a questionnaire, ask a member to be captain, approve a member,
  roll the year) calls `deliverAfterResponse()`: fan-out, push and email go
  out right then. A new action that writes `notification_deliveries` calls it
  too.
- **On a page load.** `resolveMemberState` (every signed-in console page)
  calls `runDueWorkAfterResponse()`: scheduled announcements whose time has
  come, deadline reminders for questionnaires, tasks and any other required
  action with a `due_at` (camp daytime only, 09:00–21:00), a retry of
  anything left queued, and once a day the upkeep (encrypt leftover plaintext
  ID numbers; on production only, delete avatar folders whose owner has no
  camp account). It is guarded by a row in `action_rate_limit`
  (`consumeRateLimit`, one statement on the database clock), so it runs at
  most once per five minutes across every server.
- Every step is idempotent and claim-safe: broadcasts are claimed by
  `dispatched_at`, the push and email drains lock their rows `FOR UPDATE SKIP
LOCKED`, reminders dedupe. A failing step is logged (`redactSecrets`) and does
  not stop the others. None of it runs under `E2E_TEST_MODE`.
- Erasure deletes the member's avatar folder at the moment of erasure
  (`apps/web/lib/account.ts`); the daily upkeep only catches leftovers.
- Recipes follow the same rule. A recipe run starts only from a captain's or a
  Kitchen lead's click [CORRECTION 2026-09-24: 2A] and runs in `after()`, all
  of a batch at the same time so it fits the page's 300 s; a run stuck over 10
  minutes (one queued but never started too) is reset when a Kitchen page
  loads or the source editor's loading panel polls (`resetStaleRuns`). The
  Anthropic call sets `maxRetries: 0`: the owner ruled out automatic retries.
- Telegram outbound stays off (`DEFERRED.md`). `dispatchPendingAnnouncements`
  is kept in `@camp404/telegram`; when Telegram is turned on, call it from
  `deliverDue`, not from a scheduled route.

## Conventions

- **No Google Sheets or Google Forms** (owner, 2026-09-27; narrowed
  2026-09-28). Never build a feature that sends people to a spreadsheet or
  a form, or that links out to Drive or Docs; build what the camp needs
  inside the app instead. Google Calendar (the camp calendar) and Telegram
  stay: the owner wants both.
- TypeScript throughout; shared types and Zod schemas live in
  `@camp404/types`. Validate external input at the boundary with Zod.
- Lint via `@camp404/eslint-config`; format via Prettier (`.prettierrc.json`).
- Prefer editing existing files; do not add files or abstractions a task
  doesn't need.
- Add or update tests with behavioural changes. Vitest covers units, and
  PGlite (`packages/db/src/__tests__/_harness.ts`) covers real queries.
  Playwright e2e in `apps/web/tests/e2e` is live: the `e2e` job in
  `.github/workflows/ci.yml` runs it on every source PR against a
  production build (`E2E_SERVE_BUILD=1`, `next start`; locally the default is
  `next dev`) with `E2E_TEST_MODE=1`, and `ci-pass` needs it, so a failure
  blocks merge. The `e2e-db` job serves the same kind of build.
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
- **Dues (#240): the Finance tools are for captains and Finance leads.**
  `canManageMoney` in `packages/core/src/dues.ts` is the one rule (fail-closed;
  a lead of any other team is refused), and every Finance write re-checks it
  inside its own transaction (`lockMoneyKeeper`). A member reads only their own
  dues; a concession's reason and the ledger notes never reach them. Proof of
  payment files are private blobs read only through `/api/payment-proof`, and
  the bank statement import reads the file in memory and stores nothing but
  the payments someone confirms.
- **Money is in South African rands only** (owner's call, 2026-09-24:
  "Everything should be in South African rands"). The ledger keeps integer
  cents, and every write path (payments, reimbursements, team budgets) refuses
  any currency but `ZAR` with the `Currency` Zod schema (`@camp404/types`) or
  `isCurrency`, at its boundary and again in the db function (strict: `"zar"`
  is refused, not fixed). A `CHECK (currency = 'ZAR')` on each table is the
  last guard. Only `formatMoney` formats money, and a total is a plain rand
  total (`sumMinor`). A dollar or euro figure is a label beside a rand amount
  at most (`formatForeignEquivalent`, at a rate a captain typed); the app
  never fetches a rate and never stores a foreign amount. The rules live in
  `packages/core/src/money.ts`.
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
  required check. [2026-09-29] The `main` ruleset also asks for the branch to
  be up to date with `main`, and allows squash or rebase merges only (no
  merge commits on `main`).

## Before you commit

Run the full CI gate locally — `pnpm turbo run lint typecheck test build` —
and make sure it passes. `.github/workflows/ci.yml` runs the same four on
every PR. [CORRECTION 2026-09-29] It also runs the migrations on a Neon branch
(`schema-migration`), the Playwright jobs (`e2e`, `e2e-join`, `e2e-db`), a
dependency audit (`supply-chain`) and `commitlint`; `ci-pass` waits for all of
them.
