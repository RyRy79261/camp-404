# 24 — sweeper-misc

**Headline:** WP7 (#131) is already written in the donor — take `packages/ui/src/components/skeleton.tsx` (204 lines, 8 primitives) plus the `frame: "standalone"|"inline"` prop, and the loading/boundary hole closes; everything else in this unit is small, independent hygiene.

**Camp 404 today:** `find apps/web/app -name loading.tsx` returns **0** against **26** files declaring `dynamic = "force-dynamic"`, and `packages/ui/src/components/` (77 files) has no `skeleton.tsx`, no `tabs.tsx`, no table — only `spinner.tsx`. It sends four of the donor's six security headers from `apps/web/vercel.json:11-27` (verified: no `X-Frame-Options`, no `Strict-Transport-Security`), has a good root `apps/web/app/error.tsx` (63 lines, with focus-move at :26,36-38 the donor lacks) and `apps/web/app/not-found.tsx`, and has zero `.gitattributes` guarding a 1.66 MB `design/app.pen`.

## Take these

| item | verdict | rec | value | effort | donor path | Camp 404 destination | why |
|---|---|---|---|---|---|---|---|
| Skeleton kit (8 primitives) | MISSING | COPY | high | S | `packages/ui/src/components/skeleton.tsx` | `packages/ui/src/components/skeleton.tsx` | greenfield; classes already token-clean against Camp 404's `@theme` |
| `loading.tsx` boundaries | MISSING | ADAPT | high | M | `apps/suppliers/components/route-skeleton.tsx`, `apps/web/components/boundary/page-skeleton.tsx` | `apps/web/app/**/loading.tsx` (26 routes) | the actual WP7 deliverable; kit above is the prerequisite |
| neon-pr-cleanup two-fix diff | PARTIAL | COPY | high | S | `.github/workflows/neon-pr-cleanup.yml` (142 ln) | `.github/workflows/neon-pr-cleanup.yml` (87 ln) | Camp 404's copy is the older revision; silently leaks branches |
| `X-Frame-Options` + HSTS | PARTIAL | ADAPT | high | S | `config/security-headers.mjs:18,30-33` | `apps/web/vercel.json:11-27` | two lines of JSON; **do not** copy the donor's Permissions-Policy |
| `navigateOnwards` | MISSING | ADAPT | high | S–M | `apps/web/lib/client-navigation.ts:1-55` | `apps/web/lib/client-navigation.ts` | port BEFORE S27 completion screen is built, not after |
| `member-ref-code.ts` | MISSING | ADAPT | high | S | `packages/core/src/member-ref-code.ts` (123 ln + 125 ln tests) | `packages/core/src/member-ref-code.ts` + barrel | dues/EFT identifier; `users.dues_paid` is written by nothing |
| `docker-compose.local.yml` + `createHttpDb` proxy branch | MISSING | COPY | high | S | `docker-compose.local.yml:1-76` | repo root + `packages/db/src/index.ts:46-51` | `NEON_LOCAL_PROXY` configures the pooled driver only — the app half is dead |
| `frame` prop on error/404 | PARTIAL | ADAPT | high | S | `boundary/error-recovery.tsx:29`, `not-found-view.tsx:15-21` | `packages/ui/src/components/error-recovery.tsx` | one prop + one refactor, not a file copy |
| `runAction` wrapper | PARTIAL | COPY | high | S | `apps/suppliers/lib/actions/result.ts:1-19` | shared helper for the 18 `"use server"` files | DEFERRED.md: DB throws bypass the advertised `{ok:false}` contract |
| Tasks state machine (thinking only) | MISSING | REWRITE | high | L | `packages/core/src/supplier-onboarding.ts:136-142,246-329` | `packages/core/src/tasks.ts` + `tasks` rows | three orphaned tiles, one orphaned table |
| `.gitattributes` `*.pen -merge` | MISSING | COPY | medium | S | `.gitattributes:1-35` | repo root | verified absent; `git check-attr merge design/app.pen` = unspecified |
| `name-dedupe.ts` + `categoryLabelConflicts` | MISSING | COPY | medium | S | `packages/core/src/name-dedupe.ts`, `camp-categories.ts:62-73` | `packages/core/src/name-dedupe.ts`; fix `packages/db/src/camp-config.ts:107-118` | `renameTeam` accepts a duplicate label today |

### 1. The Skeleton kit — the unit's single biggest miss

Both prior agents said the primitives "do not exist and are the donor's dependency." **They exist**: `packages/ui/src/components/skeleton.tsx`, 204 lines, exporting `Skeleton`, `SkeletonRegion`, `SkeletonText`, `SkeletonHeading`, `SkeletonCard`, `SkeletonRow`, `SkeletonCardGrid`, `SkeletonField`, `SkeletonForm`. Zero hooks, zero state, server-safe. I read it: every class it uses (`bg-muted`, `border-border`, `bg-card/40`, `rounded-xl`, `animate-pulse`) resolves against Camp 404's `@theme` (`--color-muted` at `packages/ui/src/styles/globals.css:22`, `--color-border` at :29, `--color-card` at :24) and it imports only `cn` from `../lib/utils`, which Camp 404 has at `packages/ui/src/lib/utils.ts`. **This is a near-literal copy.**

Three load-bearing details in its header (:6-21) that survive the port:
- `Skeleton` has **no intrinsic size** — the caller sizes it (`h-4 w-32`) to match the real element. A generic grey page is "honest about *something* happening and dishonest about what," and the swap must be a fill, not a reflow.
- `SkeletonRegion` owns the **single** live region: `aria-busy="true" aria-live="polite"` plus one `sr-only` label; every bar is `aria-hidden`. One announcement per boundary, not one per bar.
- It stamps `data-loading="true"` **specifically so Playwright can assert the boundary appeared** — "we added a skeleton is only true if a browser can see it." Camp 404 has a gating e2e job (`.github/workflows/ci.yml:179-214`, in `ci-pass` needs at :218); that hook should land with the first `loading.tsx`.

The shape-matching rule lives in `apps/suppliers/components/route-skeleton.tsx:16-18`, not in `page-skeleton.tsx`: `HeadingSkeleton` copies its real heading's container classes **verbatim** (`mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between`). Camp 404's equivalents are `packages/ui/src/components/section-header.tsx` and `detail-header.tsx` — copy their container classes, and pin the pair with a Storybook story (Camp 404 has Storybook 10; the donor has none, so this can be done better here).

### 2. `navigateOnwards` — port before S27, not after

55 lines. The rule: a `router.push()` + `router.refresh()` pair called **synchronously** from inside `startTransition(async …)` leaves the transition awaiting a navigation the same-tick `refresh()` supersedes — it never settles, `isPending` stays true forever, and the user sits on a Submit button stuck at "Saving…" for something already saved. The fix is a `setTimeout(…, 0)` around the pair so the transition resolves first. The donor bisected this against a production build on 28 Jul: push-only fixed it, push+refresh-in-transition hung, push+refresh-deferred fixed it *and kept the refresh* — and the refresh is what re-renders the shell above the pushed route after a gate clears.

Camp 404's live gap, verified: `apps/web/app/setup/setup-wizard.tsx:80` pushes with no refresh (doesn't hang, but the shell never re-renders after bootstrap); `apps/web/components/questionnaire/builder-wizard.tsx:162` calls `onComplete?.()` and `apps/web/app/questionnaires/[activationId]/runner.tsx:21-30` passes **no `onComplete`** — a member finishing a blocking questionnaire lands nowhere. The instant someone fixes that with `push(); refresh()`, they hit the donor's bug. Strip the `INVITE_RESUME_PATH` hard-navigation branch (Camp 404 redirects server-side). **Correction to the digest:** the seam has ~15 call sites to converge (3 push-in-transition, ~12 refresh-in-transition), not 2 — S for the module, closer to M for the sweep.

### 3. `member-ref-code.ts` — the best pure-module fit in the unit

I read the file. Its header states the use case verbatim: a stable code like `MAH-M017` that "the CAMP's own treasurer quotes for off-platform EFT reconciliation (camper → the camp's own bank account)." That is exactly Camp 404's dues situation — `duesPaid`/`duesPaidAt` at `packages/db/src/schema.ts:264-265` with nothing writing them and a `finances` tile at `comingSoon: true`.

Algorithm: `deriveCampPrefix` → NFKD, strip diacritics, uppercase, split on non-letters; first word contributes 2 letters, each later word 1 ("Mad Hatters" → `MAH`, "The Velvet Mirage" → `THVM`); back-fill from the first word to reach 3, pad with `X`, empty ⇒ `XXX`. `formatMemberRefCode(prefix, seq)` → `{PREFIX}-M{NNN}`, `padStart(3,"0")`, **throws on `sequence < 1`**. `nextMemberSequence` = max parsed + 1. `establishedCampPrefix` reads the prefix back off any existing code so one camp shares one prefix.

Port list, with two digit-level fixes to the digest: **`MEMBER_REF_RE` is module-private** (`:80`) — export `isValidMemberRefCode` (:83) and `parseMemberRefCode` (:87) instead; and **do not port `disambiguateCampPrefix`** (the A–Z then 2..999 collision walk) — one camp, no collisions. Note the sibling floor mismatch: `formatMemberRefCode` requires `sequence >= 1` while `payment-reference.ts:36-41` allows 0. Pick one rule. Derive the prefix **once** at bootstrap and **store** it — the donor's own argument (`supplier-code.ts:7-19`): "a derived code re-keys itself silently whenever an input moves and the promise breaks with no migration and no audit trail." A member editing their display name must not change the reference their treasurer already wrote on a bank statement.

### 4. neon-pr-cleanup — a two-line diff against a file that already exists

I diffed both. Camp 404's copy (87 lines) is the older revision and misses **two** real hardening changes, not four:
- **`on: pull_request:` (line 15) vs the donor's `pull_request_target:` (:47).** A Dependabot-actor close gets the empty Dependabot secret store, `NEON_API_KEY` resolves to nothing, cleanup fails, branch leaks. Camp 404's own comment acknowledges the problem and short-circuits rather than fixing it. Safe here because the job checks out **no PR code**; the `head.repo.full_name == github.repository` guard stays.
- **No pagination.** Camp 404 does a single `curl "$api/branches"` (line 52) and reads `.branches[]`. The donor pages with `?limit=10000` + `.pagination.next` cursor (`:87-109`) because an over-quota project with enough branches can hide the target beyond page one — a false "nothing to delete" on exactly the project where the leak matters.

**Correction:** the digest's third claimed gap ("no `permissions: contents: read`") is **false** — Camp 404 has it at lines 18-19. Donor file is 142 lines, not 148.

### 5. Local Neon proxy — a one-sided env var

Verified at `packages/db/src/index.ts`: `createHttpDb()` (:46-51) is `neon(requireDatabaseUrl())` straight through, documented "No transactions." — **no `NEON_LOCAL_PROXY` branch at all**. `createPooledDb()` (:56-66) sets `neonConfig.useSecureWebSocket = false` and `neonConfig.wsProxy = (host) => \`${host}:5433/v1\`` at :59-62. So the env var that exists to enable local development enables it for the crons and the CLI and **not for the app** — every route handler and server component uses the http driver. The donor's `docker-compose.local.yml:13-15` records the same finding as "a large part of why the app had never been executed end to end." The compose file is `postgres:16-alpine` on 5432 with a `pg_isready` healthcheck, `ghcr.io/neondatabase/wsproxy` on 5433:80, and `ghcr.io/timowilhelm/local-neon-http-proxy` on 4444:4444 — two proxies because `@neondatabase/serverless` speaks two protocols and no single proxy implements both. The compose file alone is not enough: add a `neonConfig.fetchEndpoint` → `localhost:4444` branch to `createHttpDb()`. Also take `scripts/e2e-local.sh` (245 lines), the runner that boots and seeds the stack — the digest ported the compose file without it.

## Already covered in Camp 404

- **Four of six security headers** — `apps/web/vercel.json:11-27`. And Camp 404's `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` is *correct where the donor's is not*: the donor's `camera=(), microphone=()` would kill the voice recorder and avatar upload.
- **Error boundary UI** — `apps/web/app/error.tsx` renders `IconBadge tone="destructive"`, `CodeDisplay` with the digest, retry + escape, and moves screen-reader focus to the heading (`:26,36-38`). The donor's 81-line version does not.
- **404 metadata** — `apps/web/app/not-found.tsx:7` sets `export const metadata: Metadata = { title: "Page not found" }`; the donor's consuming page sets none.
- **Fail-loud env** — `packages/db/src/crypto.ts:34-40` throws on missing/short `PGCRYPTO_KEY` and `apps/web/lib/env.ts:20-26` fails the whole boot. Beats the donor's decline-silently-at-call keypair rule; skip `keys.ts` entirely.
- **Character-based length limits** — `packages/types/src/questionnaire.ts:79,90,506-507`, one schema driving both counter and server validation. Better than the donor's word-count module; skip it.
- **Pure derivation + precomputed descriptors** — `packages/core/src/promotion.ts` and `MemberDetailResult` (`apps/web/app/captains/camp-management/actions.ts:41-50`) already do what `buildStepCardModel` does. Model the tasks state machine on `promotion.ts`'s shape.
- **`empty-state.tsx`** — present at `packages/ui/src/components/empty-state.tsx`. *(The verifier's MISSED list bundles it with the donor's table primitives; only `responsive-data-table.tsx`, `status-badge.tsx` and `role-badge.tsx` are actually absent here.)*
- **Gating e2e** — `.github/workflows/ci.yml:179-218`. Nothing to promote from the donor's non-gating matrix.

## Deliberately skip

- **The whole `apps/suppliers` app** — no supplier population, ~900 duplicated `(account)` lines, and the donor's own audit says `apps/org`/`apps/suppliers` are "close to being the same application twice."
- **Resend / `sendEmail`** — `notification_channel = [push, in_app, both]` (`schema.ts:172`). A fourth channel + enum value + migration + dispatch branch + operator key, for 30–80 people who already get a push. **Bank the rule only:** a `to` array handed to a provider verbatim puts every address in the `To:` header — a POPIA disclosure, not a formatting detail. No bcc path either. Camp 404 is POPIA-bound (`AGENTS.md:184`).
- **`generatePaymentReference`** — presumes a payments ledger Camp 404 should not build. `member-ref-code.ts` is the right sibling.
- **Supplier standing (6 values), CSV *reader*, camp categories taxonomy, `sound.ts`, `placement-zones.ts`, `groups.ts`/`payments.ts` type vocabularies, keypairs, editions** — all multi-tenant / event-organiser shapes. Camp 404's rank space is `[captain, member]` (`schema.ts:40`) over one `users` table with no `group_id` anywhere.
- **`setup-github-labels.ts`** — the digest's REFUTED row: `apps/web/lib/github-feedback.ts:30-32` says in full that "**Missing labels are auto-created by the issues API on first use**," so the hazard the script exists for does not apply. rec is SKIP until the taxonomy grows past `bug`/`enhancement`/`from-app`.
- **`design/qa/audit.py`** — real value but L effort, and its `FORBIDDEN = /(payment|reconcil|yoco|…)/i` encodes AfrikaBurn's never-holds-funds law, the **opposite** of Camp 404's WP10 dues direction. The `pencil` MCP server also failed to connect this session. Take the REVIEW.md discipline (fix by property and re-run until the finding is *gone*; whitelist entries must state a WHY) for free; defer the harness.
- **commitlint + husky** — three root devDeps and a hook that fires on every agent commit. Decide deliberately, not by drift.

## DB changes this unit implies

- `users.ref_code text unique` — one drizzle-kit migration (append-only per `AGENTS.md:56-68`). Verified absent: no `ref_code`/`refCode` in `packages/db/src/schema.ts`.
- If the three-flow tasks model is adopted: `ALTER TYPE task_status ADD VALUE 'awaiting_confirmation'` — today it is `[open, done, cancelled]` (`schema.ts:200`), which cannot express "member submitted, lead has not confirmed."
- Nothing else. No `payments` table, no `editions`, no `camp_categories`, no document-ack layer — all correctly out of scope.

## Quick wins (effort S)

1. Copy `config/security-headers.mjs:18,30-33` values into `apps/web/vercel.json:11-27` — add `{"key":"X-Frame-Options","value":"DENY"}` and `{"key":"Strict-Transport-Security","value":"max-age=63072000; includeSubDomains"}`. Keep Camp 404's `(self)` Permissions-Policy. Paste the donor's nonce/white-screen reasoning as a comment so nobody "finishes" the CSP later. Test: `curl -I` a preview deploy.
2. Diff donor `.github/workflows/neon-pr-cleanup.yml` → Camp 404's: swap `pull_request:` → `pull_request_target:` (keep the same-repo `if:`), add the `?limit=10000` + `.pagination.next` cursor loop. Confirm `NEON_API_KEY`/`NEON_PROJECT_ID` secret names match. Test: close a throwaway PR, check the branch is gone.
3. Copy donor `packages/ui/src/components/skeleton.tsx` → `packages/ui/src/components/skeleton.tsx`. Only change: import path for `cn`. Add a Storybook story. Test: `pnpm build` in `packages/ui`, visual check both stories.
4. Copy donor `packages/core/src/member-ref-code.ts` (drop `disambiguateCampPrefix`) + its 125-line test → `packages/core/src/member-ref-code.ts`, add `export * from "./member-ref-code";` to `packages/core/src/index.ts`. Test: the ported vitest file, unchanged minus the disambiguation cases.
5. Copy donor `packages/core/src/name-dedupe.ts` (70 lines, zero imports) + tests → `packages/core/src/`, barrel it, then use `isExactNormalizedMatch` to fix `packages/db/src/camp-config.ts:107-118 renameTeam`, which today maps `team.key === key ? {...team, label} : team` with **no conflict check** — two teams can be renamed to the same label, producing two indistinguishable roster-filter options. Test: a PGlite integration test asserting the duplicate rename is rejected.
6. Copy donor `.gitattributes` → repo root (`*.pen -merge`, `* text=auto eol=lf`, `binary` for png/jpg/ico). Verified: Camp 404 has none, and `git check-attr merge design/app.pen` returns `unspecified`. Write the operational consequence somewhere — one person edits the canvas at a time (the donor's rule points at a `CONTRIBUTING.md` §"Designers: working on the canvas" that Camp 404 does not have). Test: `git check-attr merge design/app.pen` returns `merge: unset`.
7. Copy `docker-compose.local.yml` (rename the DB, swap the `DATABASE_URL`) and add the `fetchEndpoint` branch to `createHttpDb()` at `packages/db/src/index.ts:46-51`. Test: `NEON_LOCAL_PROXY=1 pnpm dev` and load a `force-dynamic` page.
8. Replace the four bare `window.confirm` calls (`builder-canvas.tsx:328`, `lifecycle-controls.tsx:156,175`, `questionnaire-hub.tsx:79`) with the donor's inline two-state confirm (`apps/web/components/leave-camp-button.tsx:1-57`), parameterised for copy and action. Test: e2e click-through of a questionnaire delete.

## Corrections applied

- **PageSkeleton (item 5):** the digest says the Skeleton primitives "do not exist and are the donor's dependency." They do exist — `packages/ui/src/components/skeleton.tsx`, 204 lines, 8 exports. I read it and verified its token dependencies against Camp 404's `globals.css`. This upgrades the item from ADAPT/M to COPY/S for the kit (M remains for the 26 `loading.tsx`). `HeadingSkeleton` is at `apps/suppliers/components/route-skeleton.tsx:16`, not in `page-skeleton.tsx`. `packages/ui/src/components/` holds 77 files, not 74.
- **navigateOnwards (item 2):** "Camp 404 uses this construct in exactly the two places the donor names" is false — ~15 call sites (3 push-in-transition, ~12 refresh-in-transition). None does both in the same tick today, so nothing hangs *yet*.
- **AppShell (item 7):** the diagnosis "TopChrome unmounts and remounts on every navigation" is wrong. I grepped: `TopChrome` is rendered by exactly one file, `apps/web/app/page.tsx:98`. Every route other than `/` has **no top chrome at all**. The work is introducing a route-group layout that mounts chrome for the first time.
- **neon-pr-cleanup (item 44):** three of four claimed gaps → two. `permissions: contents: read` **is** present at Camp 404's lines 18-19. Donor file 142 lines, not 148.
- **setup-github-labels (item 46):** REFUTED. rec ADAPT → **SKIP** — `github-feedback.ts:30-32` states missing labels are auto-created by the issues API.
- **member-ref-code (item 10):** `MEMBER_REF_RE` is module-private (`:80`); export `isValidMemberRefCode`/`parseMemberRefCode`. Sequence floor is `>= 1`, unlike `payment-reference.ts`'s non-negative rule.
- **Mis-cited `AGENTS.md` lines, all three fixed:** "Bespoke over generic" is at **:125** with the scoped exception at **:128-132** (not :96-106); the POPIA heading is at **:184** (not :143-149); the stale-e2e sentence is at **:181-182** (not :133).
- **supplier-code.ts** is 145 lines; the code half is :1-103 and `contactNamesAddress` is :105-145 — the digest's items 11 and 12 split one file with a wrong range on item 11.
- **My own spot-check:** the digest's "three bare `window.confirm` calls" is four (`builder-canvas.tsx:328`, `lifecycle-controls.tsx:156,175`, `questionnaire-hub.tsx:79`). And Camp 404 already ships `packages/ui/src/components/empty-state.tsx` — only the donor's `responsive-data-table.tsx`, `status-badge.tsx` and `role-badge.tsx` are genuinely missing for WP9.

## Confidence notes

- Everything in "Take these" was read in source on both sides this session, except the tasks-engine item (donor `supplier-onboarding.ts` read in the harvest only, not re-opened) and `scripts/e2e-local.sh` (line count from the verifier, not re-read).
- `NotificationFilterTabs` (item 36) and the GitHub issue-form templates (item 47) were flagged **medium confidence / not individually verified** upstream — treat both as lower confidence. The filter-tabs port additionally needs `@radix-ui/react-tabs`, which Camp 404 does not have; use the existing `segmented-control.tsx` instead of adding the dep.
- The verifier's MISSED list names three auth-adjacent bodies of donor work never assessed in this unit — `packages/core/src/auth-capabilities.ts` (269 lines) and eleven `packages/ui/src/components/account-*.tsx` files (1,916 lines: 2FA, passkeys, sessions, security events, password change). Camp 404's auth-adjacent surface is genuinely zero-file (verified: no hits for passkey/twoFactor/totp/listSessions across apps + packages). That is a real, large opportunity, but it belongs to the `account` unit — **do not port it from this sweeper**, coordinate.
- `import "server-only"` appears in several donor lib files. Camp 404's `apps/web/vitest.config.ts` aliases only `@`, so any of these throws the moment a vitest test imports it. Add the alias before porting.
- Donor comments can contradict the donor's own code (its audit found eight such cases). Everything above was read from code, not from the comment above it.
