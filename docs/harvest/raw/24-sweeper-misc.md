# Unit 24 — SWEEPER: everything not covered by units 01–23

**Donor:** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app` (quagga-portal / AfrikaBurn Contributors App)
**Target:** `/home/ryan/repos/Personal/camp-404`
**Method:** full `find` over the donor tree, subtract the 23 sibling units' territory, then read every surviving file. Every claim below is `path:line`-cited and copied verbatim from source.

---

## 0. Purpose and scope

This is the catch-all unit. Its job is to find the reusable assets that fall between the named subsystems: the *pure catalogue/format/derivation* modules in `@quagga/core` that nobody else claimed, the *entire* `apps/suppliers` workspace, the app shell / navigation / boundary chrome in `apps/web/components`, the small `apps/web/lib` utilities, the console's presentation + review-state helpers in `apps/org/lib`, and the repo-level tooling in `scripts/`, `config/`, `design/qa/`, `.github/`, `.husky/`, `docker-compose.local.yml` and `commitlint.config.mjs`.

The headline finds, ranked by what Camp 404 can actually use:

1. **`config/security-headers.mjs`** — 41 lines, zero dependencies, drop-in. Camp 404 sets **no** response headers at all (`apps/web/next.config.ts` has no `headers()`). This closes a real clickjacking hole on destructive server actions.
2. **`apps/web/lib/client-navigation.ts` `navigateOnwards`** — 55 lines, the fix for a *stuck-pending server action after a gate clears*. Camp 404's questionnaire runner, setup wizard and builder all use the exact `startTransition(async …)` + `router.push` + `router.refresh` construct this module exists to correct.
3. **The `boundary/` trio + `nav-link.tsx`** — `ErrorRecovery`, `NotFoundView`, `PageSkeleton`, and a `useLinkStatus`-driven nav link. Camp 404's **WP7 (#131)** is literally "zero `loading.tsx` across 24 force-dynamic pages, exactly one error boundary". This is that work, already written, with a `frame: "standalone" | "inline"` prop that solves the nested-chrome problem WP7 will hit.
4. **`apps/web/lib/email.ts` `sendEmail`** — one-recipient-per-message with Resend batch fan-out, written to close a real POPIA disclosure where a roster send put every member's address in one `To:`. Camp 404 has **no email module at all**.
5. **The supplier checklist engine** (`supplier-onboarding.ts` + `supplier-documents.ts` + `onboarding-view.ts`) — an actor-scoped, three-flow, transition-validated checklist state machine over a partial JSONB map. Strip the supplier nouns and this is a *generic, reusable checklist/task engine* — precisely what Camp 404's orphaned `tasks` table (WP10) and its `comingSoon` Camp Tasks / Crew Tasks / My Tasks tiles need.
6. **`payment-reference.ts` + `member-ref-code.ts`** — human-quotable reference-code generators with deterministic, gap-free sequence allocation and collision-safe prefix disambiguation. Camp 404 has `users.duesPaid` written by nothing and a Finances tile with no UI (WP10); an EFT reference is the exact primitive that gap needs, and `MAH-M017` is *camp-internal EFT reconciliation*, i.e. Camp 404's actual use case, not AfrikaBurn's.
7. **`design/qa/audit.py`** — a 294-line measurement-first design-QA checker that reads the Pencil canvas over JSONRPC and emits `[DEFECT]` lines. Camp 404 has a finished Pencil design and no way to verify code against it.

---

## 1. File inventory (line counts, `wc -l`)

### 1a. `packages/core/src` — sweeper-owned modules

| File | Lines | Test file | Test lines |
|---|---|---|---|
| `sound.ts` | 69 | *(none)* | — |
| `placement-zones.ts` | 69 | *(none)* | — |
| `payment-reference.ts` | 58 | `__tests__/payment-reference.test.ts` | 50 |
| `camp-categories.ts` | 153 | `__tests__/camp-categories.test.ts` | 170 |
| `supplier-code.ts` | 145 | `__tests__/supplier-code.test.ts` | 172 |
| `supplier-import.ts` | 296 | `__tests__/supplier-import.test.ts` | 161 |
| `supplier-onboarding.ts` | 329 | `__tests__/supplier-onboarding.test.ts` | 277 |
| `supplier-standing.ts` | 142 | `__tests__/supplier-standing.test.ts` | 137 |
| `supplier-documents.ts` | 299 | `__tests__/supplier-documents.test.ts` | 371 |
| `member-ref-code.ts` | 123 | `__tests__/member-ref-code.test.ts` | 125 |
| `word-count.ts` | 37 | `__tests__/word-count.test.ts` | 39 |
| `name-dedupe.ts` | 70 | `__tests__/name-dedupe.test.ts` | 48 |
| **Total** | **1,790** | | **1,550** |

Fixture: `packages/core/src/__fixtures__/ab-suppliers-sample.ts` (the real sheet shape, used by `supplier-import.test.ts`).

> `sound.ts` and `placement-zones.ts` have **no** `__tests__` file — verified: `packages/core/src/__tests__/sound.test.ts` and `placement-zones.test.ts` do not exist. Both are pure data catalogues plus one predicate each, so the gap is defensible but real; `isNoAmplifiedSound` has non-trivial regex behaviour and is untested in core (it is indirectly covered by `apps/org/lib/org-logic.ts`'s `classifySoundLevel`, which has its own test).

### 1b. `packages/types/src` — sweeper-owned modules

| File | Lines |
|---|---|
| `groups.ts` | 50 |
| `payments.ts` | 23 |
| `categories.ts` | 29 |
| `suppliers.ts` | 172 |
| `accounts.ts` | 133 |

### 1c. `apps/web/components` — chrome, boundaries, non-registration forms

| File | Lines |
|---|---|
| `app-shell.tsx` | 139 |
| `nav-link.tsx` | 79 |
| `preview-notice.tsx` | 52 |
| `not-configured-banner.tsx` | 30 |
| `sign-out-button.tsx` | 35 |
| `boundary/error-recovery.tsx` | 81 |
| `boundary/not-found-view.tsx` | 63 |
| `boundary/page-skeleton.tsx` | 44 |
| `artworks/artwork-registration-form.tsx` | 609 |
| `vehicles/vehicle-registration-form.tsx` | 512 |
| `camp-members.tsx` | 315 |
| `camp-invites.tsx` | 149 |
| `create-camp-form.tsx` | 166 |
| `join-button.tsx` | 23 |
| `leave-camp-button.tsx` | 57 |
| `member-ref-code.tsx` | 74 |
| `registration/field-kit.tsx` | 605 *(shared with unit "registration")* |

> **NOTE on the brief's path list:** there is no `apps/web/components/camps/**` directory. The camp components are flat files at `apps/web/components/camp-members.tsx`, `camp-invites.tsx`, `create-camp-form.tsx`, `join-button.tsx`, `leave-camp-button.tsx`, `member-ref-code.tsx`. Verified by `find apps/web/components -type f`.

### 1d. `apps/web/lib` — sweeper-owned utilities

| File | Lines | Test |
|---|---|---|
| `client-navigation.ts` | 55 | `__tests__/client-navigation.test.ts` |
| `edition.ts` | 78 | — |
| `email.ts` | 126 | `__tests__/email.test.ts` |
| `keys.ts` | 60 | — |
| `groups-store.ts` | 1,024 | `__tests__/groups-store.test.ts` |
| `camp-search-action.ts` | 24 | — |
| `config.ts` | 29 | *(covered by `lib-primitives.test.ts`)* |

### 1e. `apps/org/lib` — sweeper-owned

| File | Lines |
|---|---|
| `email.ts` | 130 (self-declared **byte-identical twin** of `apps/web/lib/email.ts`) |
| `labels.ts` | 58 |
| `gate.tsx` | 124 |
| `org-logic.ts` | 186 |
| `supplier-step-reconcile.ts` | 187 |
| `queries.ts` | 2,102 (44 exports — mostly org-console read models; see §8) |

### 1f. `apps/suppliers` — the whole app (99 TS/TSX files)

14 `page.tsx` routes. Structure: `app/(account)/…` (3 pages + layout), `app/(portal)/…` (bulletins, notifications, onboarding, standing + `error.tsx`/`loading.tsx` siblings), `app/auth/…`, `app/signin`, `app/signup`, `app/api/{auth,report,report/transcribe}`; `components/` 12 files + `notifications/` 5; `lib/` 20 modules + `lib/actions/` 7 + `lib/__tests__/` **19 test files**.

Selected line counts:

| File | Lines |
|---|---|
| `components/onboarding-checklist.tsx` | 729 |
| `components/documents-panel.tsx` | 185 |
| `components/register-supplier-form.tsx` | 165 |
| `components/gate-screen.tsx` | 103 |
| `components/portal-header.tsx` | 87 |
| `components/notifications/format.ts` | 101 |
| `components/notifications/notification-panel.tsx` | 106 |
| `components/notifications/notification-row.tsx` | 77 |
| `components/notifications/filter-tabs.tsx` | 59 |
| `components/error-recovery.tsx` | 58 |
| `components/route-skeleton.tsx` | 48 |
| `components/sign-out-button.tsx` | 41 |
| `components/page-heading.tsx` | 35 |
| `components/not-configured-banner.tsx` | 31 |
| `components/header-notification-bell.tsx` | 14 |
| `lib/onboarding-view.ts` | (pure view-model; unit-tested) |
| `lib/actions/result.ts` | 19 |
| `lib/gate.tsx` | 25 |

### 1g. Repo-level tooling

| File | Lines/size | What |
|---|---|---|
| `config/security-headers.mjs` | 41 | 6 response headers, shared by all three `next.config.ts` |
| `commitlint.config.mjs` | 56 | Conventional Commits + enforced workspace scope enum |
| `.husky/commit-msg` | 8 | local half of commit-message enforcement |
| `docker-compose.local.yml` | 76 | Postgres 16 + **two** Neon proxies (ws + http) |
| `scripts/e2e-local.sh` | 12,420 bytes | cold-boot local E2E stack (mostly unit "e2e") |
| `scripts/setup-github-labels.ts` | 47 | `pnpm labels:sync` — pushes the code-owned label taxonomy |
| `.github/workflows/mobile.yml` | 118 | nightly mobile-360 persona matrix, deliberately non-gating |
| `.github/workflows/neon-pr-cleanup.yml` | 148 | delete the Neon preview branch on PR close |
| `.gitattributes` | 35 | `*.pen -merge` + the reasoning |
| `design/qa/audit.py` | 294 | measurement-first design QA checker |
| `design/qa/penctl.py` | 71 | raw JSONRPC client to the Pencil bridge |
| `design/qa/dumptext.py` | 68 | canvas text dump |
| `design/qa/REVIEW.md` | 103 | the binding review process |
| `design/pen-lessons.md` | 1,194 | accumulated canvas lessons |
| `design/qa/whitelist.json` | — | verified-intentional exceptions, each with a WHY |

---

## 2. Capability list (exhaustive, cited)

### 2.1 Reference-code generation and allocation

- **Payment reference `QP-2027-MAH-001`** — prefix + edition year + ≤6-char subject code + 3-digit-min zero-padded sequence (`packages/core/src/payment-reference.ts:26-45`). Throws when the cleaned code is empty (`:35`) or the sequence is not a non-negative integer (`:38`).
- **Subject-code derivation** — first up-to-3 alphanumerics of an NFKD-normalised, diacritic-stripped, upper-cased name; `"XXX"` fallback (`payment-reference.ts:52-58`).
- **Supplier code `SUP-2027-0416`** — fixed prefix, 4-digit year, ≥4-digit zero-padded sequence (`supplier-code.ts:31-53`), regex `^SUP-(\d{4})-(\d{4,})$` (`:35`).
- **Gap-free, retry-idempotent sequence allocation** — `nextSupplierSequence` scans existing codes, ignores other years, and *skips unparseable values rather than throwing* so a legacy/hand-entered code cannot stall issuance (`supplier-code.ts:76-89`).
- **Whole-token email matching inside free-text contact prose** — `contactNamesAddress` (`supplier-code.ts:135-145`), written to close an *account-takeover* found in production (§5.3).
- **Camp-scoped member ref code `MAH-M017`** — prefix derivation (`deriveCampPrefix`, `member-ref-code.ts:21-40`), deterministic collision disambiguation over a taken-set (`disambiguateCampPrefix`, `:49-66`), format/parse/validate (`:69-95`), `establishedCampPrefix` so every member of one camp shares one prefix (`:102-111`), `nextMemberSequence` (`:114-122`).

### 2.2 Supplier lifecycle (the reusable checklist engine)

- **7-step ordered catalogue with completes/confirms metadata and inline corpus-grounded copy** (`supplier-onboarding.ts:60-133`).
- **Four confirmation semantics** → **three interaction flows** — `auto` / `org_may_revoke` → `self_service`; `org_reviews` → `org_reviewed`; `org_confirms` → `org_confirmed` (`supplier-onboarding.ts:136-142`).
- **n/7 progress derivation from a partial JSONB map**, missing key ⇒ `pending`, only `completed` counts, `awaiting` counted separately (`deriveOnboardingProgress`, `:198-215`).
- **Actor-scoped transition validation** — `validateStepTransition` (`:246-303`); org may do anything, supplier is confined per flow.
- **Immutable apply** — `applyStepTransition` returns a *new* map, never mutates (`:314-329`).
- **Document → step binding with a self-service-only guard** — `validateDocumentBinding` (`supplier-documents.ts:148-176`); rejects unknown keys, org-confirmed steps, and a binding on a non-`requiredAck` document (which would be inert).
- **Bidirectional ack↔step reconciliation** — `applyDocumentAcksToSteps` (`supplier-documents.ts:238-299`); completing *and reverting*, with an `alsoConsider` escape hatch for the step a deleted/rebound document used to carry.
- **Whole-edition reconciliation sweep after an org document edit** — `reconcileEditionSupplierSteps` (`apps/org/lib/supplier-step-reconcile.ts:69-187`), transaction-scoped, audited, returning the list of steps that moved *backwards* so those suppliers can be told.
- **Standing vocabulary + tone/label/description mapping** — 6 values, display order, `standingTone` collapsing 4 positives to `success` (`supplier-standing.ts:11-83`).
- **Camp-side picker eligibility** — suspended excluded, `watch` flagged, incomplete onboarding *tagged not hidden* (`supplierPickerEligibility`, `:105-119`; `filterPickerEligible`, `:125-141`).
- **Card view-model** — `buildStepCardModel` turns a step+status into `{tone, statusLabel, supplierActionable, primaryAction?, secondaryAction?}` so the UI can only ever offer legal moves (`apps/suppliers/lib/onboarding-view.ts:113-183`).
- **Honest-or-silent identifier chip** — `supplierCodeChipValue` returns `null` (render nothing) rather than an em-dash placeholder, because the code leaves the platform (`onboarding-view.ts:38-42`).

### 2.3 CSV import of a real, messy Google Sheet

- **Dependency-free RFC4180-ish CSV parser** handling quoted fields, doubled `""` escapes and embedded newlines (`supplier-import.ts:34-71`).
- **Merged-cell block reconstruction** — a blank column A means "still the previous supplier"; rows are grouped into blocks before mapping (`:220-231`).
- **Privacy scrub at parse time** — phone numbers and free-text addresses in the contact column are *dropped, never retained even transiently*; only business name, contact-person name and business email survive (`:17-21`, `:266-277`).
- **Four value mappers** — `mapStatusToStanding` (`:88-102`), `mapReturning` (`:105-114`), `normalizeCategory` with Transportation→Transport / FIREWOOD DELIVERY special cases + title-casing that preserves `/` and `&` (`:141-155`), `feePhraseToStepKey` (`:158-173`).
- **Self-registration service categories** — an 8-value tuple deliberately expressed *in `normalizeCategory`'s output shape* so a self-registered and a sheet-imported supplier land in the same bucket (`:124-133`).

### 2.4 Camp categories (per-edition taxonomy)

- 8 canonical seed categories with curated emoji (`camp-categories.ts:29-38`).
- Normalizer reused from `name-dedupe` so categories dedupe like every other named entity (`:46-48`).
- `categoryLabelConflicts` with an `exceptId` so a rename never conflicts with itself (`:62-73`).
- `validateCampCategory` = Zod boundary + dedupe → returns storage-ready `{label, labelNormalized, emoji, sort}` (`:92-116`).
- `countCategoryUsage` (absent ⇒ 0, `:124-130`), `categorySelectionExceedsSuggested` (soft cap, never blocks, `:136-138`), `matchesCategoryFilter` (null filter matches everything, `:150-156`).

### 2.5 Name dedupe & word limits

- `normalizeName` — NFKD, diacritics stripped, lowercased, all non-alphanumerics removed (`name-dedupe.ts:13-20`).
- `trigramSimilarity` — a faithful reimplementation of PostgreSQL `pg_trgm`'s Jaccard-over-trigrams, including pg_trgm's exact padding (`"  c"`, `" ca"`, `"cat"`, `"at "`) so an app-side warning matches what a DB-side `similarity()` would say (`:31-63`).
- `SIMILARITY_WARN_THRESHOLD = 0.55` (`:27`).
- `countWords` / `isWithinWordLimit` / `wordsRemaining` with `CAMP_DESCRIPTION_WORD_LIMIT = 60` (`word-count.ts:6-36`).

### 2.6 Sound + placement catalogues

- `SOUND_SCALE` — 5 options, each `{value, label, blurb}`, where `value` is stored verbatim (`sound.ts:21-48`).
- `isNoAmplifiedSound` — any digit ⇒ amplified; otherwise word-boundary match on `no|none|acoustic|silent|zero` or the substring `"no amplif"` (`sound.ts:59-68`).
- `PLACEMENT_ZONES_2027` — 7 zones (`placement-zones.ts:18-46`), keyed per edition year with a fallback (`getPlacementZones`, `:66-68`). **The pattern is the asset:** "the frozen schema has no per-edition zone table, so the code owns the list keyed by edition year; new editions add an entry without a migration" (`:2-7`).

### 2.7 App chrome, navigation and boundaries

- **`AppShell`** — one server component mounted from the route-group `layout.tsx`, not per page, so the header survives client-side navigation (`app-shell.tsx:20-27`); three reads **awaited, never `<Suspense>`-streamed**, with the reasoning proved by reading the actual wire response (`:29-38`); `minimalNav` (signed-out one-purpose pages) and `gatedNav` (signed-in but held by a gate) flags (`:40-52`).
- **`NavLink`** — `useLinkStatus()` pending feedback on the control that was pressed, plus a `sr-only` "Loading {label}…" (`nav-link.tsx:74`); `prefetch` deliberately left at `auto` (`:16-22`); **icons passed as a string KEY, never as a component**, because Lucide icons are `forwardRef` objects a server component cannot serialise across the boundary (`:24-30`).
- **`ErrorRecovery`** — branded retry panel with Next's `reset`, an optional `error.digest` "Ref" line, `console.error` for triage, never a stack to the user, and a `frame: "standalone" | "inline"` prop so a nested boundary does not stack two chromes (`boundary/error-recovery.tsx:26-34`).
- **`NotFoundView`** — same `frame` prop, and copy that "never implies the thing existed and vanished" (`boundary/not-found-view.tsx:6-9`).
- **`PageSkeleton`** — `rows`/`cards` props, server-safe, no hooks, streams instantly (`boundary/page-skeleton.tsx:23-27`).
- **`PortalPageSkeleton` / `HeadingSkeleton`** — the *shape-matching* skeleton discipline: the heading placeholder copies `PageHeading`'s container classes verbatim so the real heading lands in exactly the box the skeleton held (`apps/suppliers/components/route-skeleton.tsx:7-12`).
- **`PreviewNotice`** — a degraded-state notice that distinguishes *missing env* from *connected-but-unseeded*, because the one-cause version "cost real time on the first real deployment" (`preview-notice.tsx:9-19`).
- **`NotConfiguredBanner`** — renders nothing when `missingConfig()` is empty (`not-configured-banner.tsx:10-11`).

### 2.8 Server-action navigation and result conventions

- **`navigateOnwards(router, href)`** — hard `window.location.assign` for the invite-resume path (so the request carries the new session cookie), soft push+refresh otherwise, **both deferred one macrotask** so the enclosing `startTransition` can settle first (`client-navigation.ts:47-54`). See §9.1 for the verbatim rationale.
- **`runAction` / `ActionResult`** — `{ok:true} | {ok:false; error}`; actions never throw to the client (`apps/suppliers/lib/actions/result.ts:4-18`).
- **`guardPortal` / `guardConsole`** — the *guard returns a renderable node*, so a page short-circuits **before** fetching data: `const guard = await guardPortal(); if (!guard.ok) return guard.node;` (`apps/suppliers/lib/gate.tsx:10-15`; `apps/org/lib/gate.tsx:19-25`).

### 2.9 Email

- `sendEmail` — Resend HTTP when `RESEND_API_KEY` is set, otherwise `console.info` and `{ok:true, id:null, delivered:false}` so the caller can be honest without failing (`apps/web/lib/email.ts:56-64`).
- **One recipient per message, always**; multi-recipient sends fan out through Resend's batch endpoint chunked at `RESEND_BATCH_MAX = 100`; **no bcc path at all**, deliberately (`:34-45`, `:80-92`).
- HTML derived from text with `escapeHtml` when not supplied (`:66`, `:123-125`).

### 2.10 Crypto keypairs (WebCrypto, no dependency)

- `generateProfileKeypair()` — ECDSA P-256, `raw` public + `pkcs8` private, both base64 (`apps/web/lib/keys.ts:26-41`).
- `fingerprintPublicKey()` — SHA-256 of the raw bytes, hex, first 8 colon-separated pairs, e.g. `a1:b2:c3:d4:e5:f6:07:18` (`:50-59`).
- **The conditional-storage rule:** minting is declined entirely when there is no `PGCRYPTO_KEY` to protect the private half with, rather than persisting plaintext under a column named `encrypted_private_key` (`keys.ts:8-15`).

### 2.11 Edition resolution and label formatting

- `getActiveEdition` — `react.cache()`-wrapped, `isActive` first then newest by year, `null` on empty/unreachable (`apps/web/lib/edition.ts:25-39`).
- `getEditionLabel` — never throws; falls back to `FALLBACK_EDITION_LABEL = "AfrikaBurn 2027 · 26 April – 2 May 2027"` (`:43`, `:69-77`); formats via `toLocaleDateString("en-GB", {timeZone: "UTC"})` (`:46-63`).

### 2.12 Console presentation + review-state helpers

- `formatMoney(amountCents, currency)` — `"—"` when null, else `en-ZA` 2-dp (`apps/org/lib/labels.ts:17-27`).
- `formatDate` / `formatDateTime` — `en-ZA`, `hour12: false`; **the audit trail gets minutes because "a burst is only visible with minutes"** (`labels.ts:41-42`).
- `REVIEW_ACTIONS` = `["start_review","approve","request_changes","reject"]` (`org-logic.ts:18-23`), target-status map (`:26-31`), label map (`:34-39`).
- `resolveReviewActionPath` — direct transition preferred, else route through `under_review`, else throw (`:50-77`); `resolveReviewAction` re-asserts every hop as defence-in-depth (`:83-93`); `availableReviewActions` derives the offered buttons from the state machine, never from a hand-kept list (`:106-110`).
- `deriveCohort(hasPriorRegistration)` → `"new" | "returning"` — derived, never stored (`:117-123`).
- `classifySoundLevel` — digit 1–4 anywhere wins; else the no-sound word set; else `"unspecified"` (`:172-185`), plus `SOUND_LEVEL_LABELS` and `SOUND_LEVEL_SHORT` (none/unspecified collapse to `"—"`) (`:141-168`).

### 2.13 Directory/group store logic (non-tenant parts)

- `slugify` — NFKD, diacritics stripped, alnum runs hyphen-joined, `"camp"` fallback (`groups-store.ts:74-84`).
- `checkCampName` — reject exact normalized collision *within the same kind*, warn (never block) on trigram ≥ 0.55, warnings sorted by descending similarity (`:768-786`).
- `prepareCampCreate` / `createCampWrites` / `createCamp` — the **read-half / write-half split** so a composite flow can validate before opening a transaction (`:812-816`); slug-collision retry loop bounded at 5 attempts with a 4-char base36 suffix (`:848-857`); `UNIQUE_VIOLATION = "23505"` recognised on the Neon driver's `.code` and mapped to the graceful message rather than a 500 (`:793-801`, `:940-947`).
- **Atomic group+lead-membership insert** so "a failure can never leave a group with no lead (the no-lockout backstop would be broken by such an orphan)" (`:875-879`).

### 2.14 Repo tooling capabilities

- **Security headers** — 6 headers on `/:path*` (§9.2).
- **Commit-message enforcement** — Conventional Commits, `scope-enum` = the workspace list, `header-max-length` **72** (not 100, "GitHub truncates list views around there"), body/footer max-line 100 as a *warning* because "hard-wrapping a URL … makes the message worse", and `ignores` for GitHub-generated merge/revert messages (`commitlint.config.mjs:35-52`). Enforced **twice** because the repo *merges* rather than squashes, so every commit lands on `main` (`:5-10`).
- **Neon preview-branch cleanup** — `pull_request_target` on `closed`, same-repo only, cursor-paginated branch listing, `primary != true` guard, bounded curl retries without `--retry-all-errors` (`.github/workflows/neon-pr-cleanup.yml`).
- **Non-gating nightly matrix** — 8 personas on `mobile-360`, `E2E_RETRIES: "0"`, `permissions: contents: read`, in its **own workflow file** because GitHub cannot interpolate a matrix label for a *skipped* job and the checks list showed a literal `mobile · ${{ matrix.label }}` on every PR (`.github/workflows/mobile.yml:3-19`).
- **Two-proxy local Neon stack** — `wsproxy` (port 5433) for the WebSocket/transactional driver and `local-neon-http-proxy` (port 4444) for SQL-over-HTTP, because "no single local proxy implements both" (`docker-compose.local.yml:6-19`).
- **Design-QA measurement harness** — see §7.

---

## 3. Data model (verbatim)

### 3.1 Enums owned by this unit (`packages/db/src/schema.ts`)

```ts
export const supplierStandingEnum = pgEnum("supplier_standing", [
  "good",
  "watch",
  "suspended",
  "diligent_first_timer",
  "adapting",
  "absolute_beginner",
]);                                                        // schema.ts:153-160

export const supplierReturningEnum = pgEnum("supplier_returning", [
  "newbie",
  "returning",
]);                                                        // schema.ts:164-167

export const supplierNoteKindEnum = pgEnum("supplier_note_kind", [
  "infraction",
  "blessing",
  "note",
]);                                                        // schema.ts:169-173

export const supplierDocumentSourceEnum = pgEnum("supplier_document_source", [
  "file",
  "link",
]);                                                        // schema.ts:179-182

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "reconciled",
  "waived",
]);                                                        // schema.ts:200-204

export const groupKindEnum = pgEnum("group_kind", [...]);  // schema.ts:49
export const joinabilityEnum = pgEnum("joinability", ["open", "invite_only"]);
                                                           // schema.ts:56
export const groupVisibilityEnum = pgEnum("group_visibility", [...]);
                                                           // schema.ts:60
export const inviteKindEnum = pgEnum("invite_kind", [...]); // schema.ts:80
```

Zod mirrors (`packages/types/src/`):

- `SupplierStanding` (6 values) — `suppliers.ts:29-36`
- `SupplierReturning` (`newbie|returning`) — `suppliers.ts:44-45`
- `SUPPLIER_ONBOARDING_STEP_KEYS` (7, in procedure order) — `suppliers.ts:54-62`
- `SupplierOnboardingStepStatus` (`pending|awaiting_confirmation|completed`) — `suppliers.ts:76-80`
- `SupplierOnboardingSteps = Partial<Record<Key, Status>>` + a lenient `z.record` validator — `suppliers.ts:87-99`
- `SupplierNoteKind` (`infraction|blessing|note`) — `suppliers.ts:108`
- `SupplierImportRow` — `suppliers.ts:112-137`
- `SupplierDocumentSourceType` (`file|link`) — `suppliers.ts:150`
- `SupplierDocumentInput` — `suppliers.ts:163-170`, with `title` ≤160, `url` ≤2048 and `.url()`, `requiredAck` default `false`, `stepKey` nullable default `null`, `sort` int 0–9999 nullable
- `PaymentStatus` (`pending|reconciled|waived`) — `payments.ts:11`
- `PaymentSubjectType` (`registration|group|membership`) — `payments.ts:19-23`
- `CampCategoryInput` — `categories.ts:25-29`, `label` trim 1–40, `emoji` 1–16 nullish, `sort` int 0–9999 optional; `CATEGORY_SUGGESTED_MAX = 4`, `CATEGORY_LABEL_MIN = 1`, `CATEGORY_LABEL_MAX = 40` (`categories.ts:13-17`)
- `GroupKind`, `isProjectKind`, `Joinability`, `GroupVisibility`, `InviteKind` — `groups.ts:9-50`
- `AccountDeletionStatus`, `EmailChangeStatus`, `AuthCapabilityKey` (12), `AuthCapabilitySupport`, `SecurityEventKind` (10), `SecurityEventLogKind` (9) — `accounts.ts:30-133`

### 3.2 Tables owned by this unit

**`suppliers`** (`schema.ts:1488-1529`)
`id uuid pk defaultRandom` · `name text notNull` · `code text unique` (nullable — imported rows predate the scheme, backfilled lazily) · `services text` · `contact text` · `website text` · `category text` · `returning supplier_returning` · `standing supplier_standing notNull default 'good'` · `user_id uuid → users.id onDelete:set null` · `imported_at timestamp` · `created_at`/`updated_at timestamp notNull defaultNow`
Indexes: `suppliers_name_idx(name)`, `suppliers_standing_idx(standing)`, `suppliers_user_idx(user_id)`

**`supplier_onboarding`** (`schema.ts:1538-1563`)
`id` · `supplier_id → suppliers.id cascade` · `edition_id → editions.id cascade` · `steps jsonb $type<SupplierOnboardingSteps> notNull default {}` · timestamps
Indexes: `uniqueIndex supplier_onboarding_supplier_edition_idx(supplier_id, edition_id)`, `supplier_onboarding_edition_idx(edition_id)`

**`supplier_notes`** (`schema.ts:1567-1587`)
`id` · `supplier_id cascade` · `author_id → users.id set null` · `kind supplier_note_kind notNull default 'note'` · `body text notNull` · `created_at`
Index: `supplier_notes_supplier_idx(supplier_id)`

**`supplier_documents`** (`schema.ts:1597-1634`)
`id` · `edition_id cascade` · `title text notNull` · `source_type supplier_document_source notNull default 'link'` · `url text notNull` · `required_ack boolean notNull default false` · `step_key text` (**plain text, not an enum column**, "to match how `supplier_onboarding.steps` stores keys; validated by the Zod enum at the boundary" — `:1618-1620`) · `sort integer notNull default 0` · `created_by_user_id → users.id set null` · timestamps
Indexes: `supplier_documents_edition_sort_idx(edition_id, sort)`, `supplier_documents_edition_step_idx(edition_id, step_key)`

**`supplier_document_acks`** (`schema.ts:1638-1653`)
`supplier_id cascade` · `document_id → supplier_documents.id cascade` · `acked_at timestamp notNull defaultNow`
`primaryKey(supplier_id, document_id)` — one ack per pair, idempotent; **un-acknowledging deletes the row** (`:1636-1637`)
Index: `supplier_document_acks_document_idx(document_id)`

**`supplier_declarations`** (`schema.ts:1659-1676`)
`registration_id cascade` · `supplier_id cascade` · `note text` · `created_at`; `primaryKey(registration_id, supplier_id)`; index on `supplier_id`

**`payments`** (`schema.ts:1682-1704`)
`id` · `subject_type text notNull` · `subject_id uuid notNull` · `amount_cents integer` (nullable) · `currency text notNull default 'ZAR'` · `reference text notNull unique` · `status payment_status notNull default 'pending'` · `details jsonb $type<Record<string, unknown>>` · `recorded_by_user_id → users.id set null` · timestamps
Indexes: `payments_subject_idx(subject_type, subject_id)`, `payments_status_idx(status)`
**Product law in the schema comment:** "Payment DETAILS + reference + status only. No processing, ever." (`:1678-1681`)

**`camp_categories`** (`schema.ts:1782-1807`)
`id` · `edition_id cascade` · `label text notNull` · `label_normalized text notNull` · `emoji text` · `sort integer notNull default 0` · timestamps
Indexes: `uniqueIndex camp_categories_edition_label_idx(edition_id, label_normalized)`, `camp_categories_edition_sort_idx(edition_id, sort)`

**`group_categories`** (`schema.ts:1816-1830`)
`group_id cascade` · `category_id → camp_categories.id cascade` · `created_at`; `primaryKey(group_id, category_id)`; index `group_categories_category_idx(category_id)`

**`editions`** (`schema.ts:574-582`)
`id` · `name text notNull` · `year integer notNull unique` · `start_date date {mode:"string"} notNull` · `end_date date notNull` · `is_active boolean notNull default false` · `created_at`

**`groups`** (`schema.ts:717-747`) — `kind`, `name`, `name_normalized`, `slug`, `description` (60-word limit enforced in core+UI), `joinability` default `invite_only`, `visibility` default `default`, `created_by_user_id`; `uniqueIndex groups_kind_name_normalized_idx(kind, name_normalized)`, `uniqueIndex groups_slug_idx(slug)`

**`memberships`** (`schema.ts:752-795`) — `user_id`, `group_id`, `role membership_role notNull default 'member'`, **`ref_code text` nullable, unique per group** (`uniqueIndex memberships_group_ref_code_idx(group_id, ref_code)`, `:790-792`); `uniqueIndex memberships_user_group_idx(user_id, group_id)`; `memberships_group_idx(group_id)`

**`invites`** (`schema.ts:1042-1065`) — `group_id cascade`, `token text notNull unique`, `kind invite_kind default 'member'`, `created_by_user_id`, `expires_at`, `used_by_user_id`, `used_at`, `created_at`; index on `group_id`

---

## 4. Public API surface (verbatim signatures)

### `@quagga/core` — sweeper modules

```ts
// payment-reference.ts
export const PAYMENT_REFERENCE_PREFIX = "QP";
export interface PaymentReferenceParts { prefix?: string; year: number; code: string; sequence: number }
export function generatePaymentReference({ prefix = PAYMENT_REFERENCE_PREFIX, year, code, sequence }: PaymentReferenceParts): string
export function deriveSubjectCode(name: string): string

// supplier-code.ts
export const SUPPLIER_CODE_PREFIX = "SUP";
export const SUPPLIER_CODE_SEQUENCE_PAD = 4;
export function formatSupplierCode(year: number, sequence: number): string
export function isValidSupplierCode(code: string): boolean
export function parseSupplierCode(code: string): { year: number; sequence: number } | null
export function nextSupplierSequence(year: number, existingCodes: Iterable<string | null | undefined>): number
export function issueSupplierCode(year: number, existingCodes: Iterable<string | null | undefined>): string
export function contactNamesAddress(contact: string | null | undefined, address: string): boolean

// member-ref-code.ts
export function deriveCampPrefix(name: string): string
export function disambiguateCampPrefix(name: string, taken: Iterable<string>): string
export function formatMemberRefCode(prefix: string, sequence: number): string
export function isValidMemberRefCode(code: string): boolean
export function parseMemberRefCode(code: string): { prefix: string; sequence: number } | null
export function establishedCampPrefix(existingCodes: Iterable<string>): string | null
export function nextMemberSequence(existingCodes: Iterable<string>): number

// supplier-onboarding.ts
export type SupplierStepActor = "supplier" | "org";
export type SupplierStepConfirmation = "auto" | "org_may_revoke" | "org_reviews" | "org_confirms";
export type SupplierStepFlow = "self_service" | "org_reviewed" | "org_confirmed";
export interface SupplierOnboardingStep { key; order: number; title: string; description: string;
                                          completedBy: SupplierStepActor; confirmation: SupplierStepConfirmation }
export const SUPPLIER_ONBOARDING_STEPS: readonly SupplierOnboardingStep[];
export const SUPPLIER_ONBOARDING_STEP_COUNT = SUPPLIER_ONBOARDING_STEPS.length;   // 7
export function supplierOnboardingStep(key: SupplierOnboardingStepKey): SupplierOnboardingStep | undefined
export function stepFlow(step: SupplierOnboardingStep): SupplierStepFlow
export function isSelfServiceStep(step): boolean
export function isOrgConfirmedStep(step): boolean
export function isOrgReviewedStep(step): boolean
export function stepStatus(states: SupplierOnboardingSteps | null | undefined, key): SupplierOnboardingStepStatus
export function deriveOnboardingProgress(states: SupplierOnboardingSteps | null | undefined): SupplierOnboardingProgress
export function defaultOnboardingSteps(): SupplierOnboardingSteps
export function validateStepTransition(t: StepTransition): StepTransitionResult
export function applyStepTransition(states, actor: SupplierStepActor, stepKey, to): ApplyStepTransitionResult

// supplier-documents.ts
export function sortDocuments(documents: readonly SupplierDocument[]): SupplierDocument[]
export function buildDocumentViews(documents, acks): SupplierDocumentView[]
export function documentsForStep(documents, stepKey): SupplierDocument[]
export function requiredAckDocuments(documents): SupplierDocument[]
export function deriveDocumentAckProgress(documents, acks): DocumentAckProgress
export function validateDocumentBinding(stepKey: SupplierOnboardingStepKey | null | undefined,
                                        requiredAck: boolean): DocumentBindingResult
export function satisfiedStepKeys(documents, acks): SupplierOnboardingStepKey[]
export function isStepSatisfiedByAcks(documents, acks, stepKey): boolean
export function applyDocumentAcksToSteps(states, documents, acks,
                                         alsoConsider: readonly SupplierOnboardingStepKey[] = []): DocumentAckStepResult

// supplier-standing.ts
export const SUPPLIER_STANDINGS: readonly SupplierStanding[];
export function isSuspended(standing): boolean
export function standingRequiresCaution(standing): boolean
export function standingLabel(standing): string
export function standingDescription(standing): string
export type SupplierStandingTone = "success" | "warning" | "destructive";
export function standingTone(standing): SupplierStandingTone
export function supplierPickerEligibility(input: { standing; isOnboarded: boolean }): SupplierPickerEligibility
export function filterPickerEligible<T extends { standing; isOnboarded: boolean }>(
  suppliers: readonly T[]): Array<T & { eligibility: SupplierPickerEligibility }>

// supplier-import.ts
export function parseCsv(text: string): string[][]
export function mapStatusToStanding(raw: string): SupplierStanding
export function mapReturning(raw: string): SupplierReturning | null
export const SUPPLIER_SERVICE_CATEGORIES = [...] as const;
export type SupplierServiceCategory = (typeof SUPPLIER_SERVICE_CATEGORIES)[number];
export function normalizeCategory(raw: string): string
export function feePhraseToStepKey(raw: string): SupplierOnboardingStepKey | null
export function parseSuppliersCsv(csvText: string): SupplierImportRow[]

// camp-categories.ts
export const CANONICAL_CAMP_CATEGORIES: readonly CanonicalCategory[];
export function normalizeCategoryLabel(label: string): string
export function categoryLabelConflicts(label: string, existing: readonly CategoryLike[], exceptId?: string): boolean
export type ValidateCategoryResult =
  | { ok: true; label: string; labelNormalized: string; emoji: string | null; sort: number | null }
  | { ok: false; error: string };
export function validateCampCategory(raw: unknown, existing: readonly CategoryLike[], exceptId?: string): ValidateCategoryResult
export function countCategoryUsage(assignments: readonly { categoryId: string }[]): Map<string, number>
export function categorySelectionExceedsSuggested(count: number): boolean
export function matchesCategoryFilter(entry: CategorizedEntry, categoryId: string | null | undefined): boolean

// name-dedupe.ts
export function normalizeName(input: string): string
export function isExactNormalizedMatch(a: string, b: string): boolean
export const SIMILARITY_WARN_THRESHOLD = 0.55;
export function trigramSimilarity(a: string, b: string): number
export function isSimilarName(a: string, b: string, threshold: number = SIMILARITY_WARN_THRESHOLD): boolean

// word-count.ts
export const CAMP_DESCRIPTION_WORD_LIMIT = 60;
export function countWords(input: string | null | undefined): number
export function isWithinWordLimit(input, limit: number = CAMP_DESCRIPTION_WORD_LIMIT): boolean
export function wordsRemaining(input, limit: number = CAMP_DESCRIPTION_WORD_LIMIT): number

// sound.ts
export interface SoundLevelOption { readonly value: string; readonly label: string; readonly blurb: string }
export const SOUND_SCALE: readonly SoundLevelOption[];
export const SOUND_SCALE_VALUES: readonly string[];
export function isNoAmplifiedSound(value: string | null | undefined): boolean

// placement-zones.ts
export interface PlacementZone { readonly value: string; readonly label: string; readonly blurb: string }
export const PLACEMENT_ZONES_2027: readonly PlacementZone[];
export function getPlacementZones(year: number): readonly PlacementZone[]
```

### `apps/web/lib`

```ts
// client-navigation.ts
export interface PushRouter { push: (href: string) => void; refresh: () => void }
export function navigateOnwards(router: PushRouter, href: string): void

// email.ts  (and the byte-identical apps/org/lib/email.ts)
export interface SendEmailInput { to: string | string[]; subject: string; text: string; html?: string; from?: string }
export type SendEmailResult = { ok: true; id: string | null; delivered: boolean } | { ok: false; error: string }
export function isEmailConfigured(): boolean
export function sendEmail(input: SendEmailInput): Promise<SendEmailResult>

// keys.ts
export interface GeneratedKeypair { publicKeyB64: string; privateKeyB64: string }
export function generateProfileKeypair(): Promise<GeneratedKeypair>
export function fingerprintPublicKey(publicKeyB64: string): Promise<string>

// edition.ts
export interface Edition { id; name; year: number; startDate: string; endDate: string; isActive: boolean }
export const getActiveEdition: () => Promise<Edition | null>          // react cache()-wrapped
export const FALLBACK_EDITION_LABEL = "AfrikaBurn 2027 · 26 April – 2 May 2027";
export function getEditionLabel(): Promise<string>

// config.ts
export function isAuthConfigured(): boolean
export function isDatabaseConfigured(): boolean
export function isFullyConfigured(): boolean
export function missingConfig(): string[]

// camp-search-action.ts
export async function searchCampsAction(query: unknown): Promise<CampSearchResult[]>   // "use server"
```

### `apps/org/lib`

```ts
// labels.ts
export const GROUP_KIND_LABELS: Record<string, string>
export const JOINABILITY_LABELS: Record<string, string>
export function formatMoney(amountCents: number | null, currency: string): string
export function formatDate(value: Date | string | null | undefined): string
export function formatDateTime(value: Date | string | null | undefined): string

// gate.tsx
export async function guardConsole(): Promise<{ ok: true; session: OrgSession } | { ok: false; node: ReactNode }>

// org-logic.ts
export const REVIEW_ACTIONS = ["start_review","approve","request_changes","reject"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const REVIEW_ACTION_TARGET: Record<ReviewAction, RegistrationStatus>
export const REVIEW_ACTION_LABELS: Record<ReviewAction, string>
export function resolveReviewActionPath(from: RegistrationStatus, action: ReviewAction): RegistrationStatus[]
export function resolveReviewAction(from: RegistrationStatus, action: ReviewAction): RegistrationStatus
export function isReviewActionAvailable(from: RegistrationStatus, action: ReviewAction): boolean
export function availableReviewActions(from: RegistrationStatus): ReviewAction[]
export type Cohort = "new" | "returning";
export function deriveCohort(hasPriorRegistration: boolean): Cohort
export const SOUND_LEVELS = ["none","level_1","level_2","level_3","level_4","unspecified"] as const;
export type SoundLevel = (typeof SOUND_LEVELS)[number];
export const SOUND_LEVEL_LABELS: Record<SoundLevel, string>
export const SOUND_LEVEL_SHORT: Record<SoundLevel, string>
export function classifySoundLevel(raw: string | null | undefined): SoundLevel

// supplier-step-reconcile.ts
export interface ReopenedStep { supplierId: string; userId: string | null; supplierName: string; stepKey }
export interface ReconcileResult { changed: number; reopened: ReopenedStep[] }
export async function reconcileEditionSupplierSteps(
  tx: OrgTx, editionId: string,
  alsoConsider: readonly SupplierOnboardingStepKey[] = [], actorId: string): Promise<ReconcileResult>
```

### `apps/suppliers/lib`

```ts
// actions/result.ts
export type ActionResult = { ok: true } | { ok: false; error: string };
export async function runAction(fn: () => Promise<void>): Promise<ActionResult>

// gate.tsx
export async function guardPortal(): Promise<{ ok: true; session: SupplierSession } | { ok: false; node: ReactNode }>

// onboarding-view.ts
export type StepStatusTone = "done" | "awaiting" | "pending";
export function supplierCodeChipValue(code: string | null | undefined): string | null
export function stepEyebrow(step: SupplierOnboardingStep): string
export interface StepCardModel { flow; status; tone; statusLabel: string; supplierActionable: boolean;
  primaryAction?: { label: string; to: SupplierOnboardingStepStatus };
  secondaryAction?: { label: string; to: SupplierOnboardingStepStatus } }
export function buildStepCardModel(view: SupplierOnboardingStepView): StepCardModel
```

### Components

```tsx
export async function AppShell({ children, minimalNav = false, gatedNav = false }): Promise<JSX.Element>
export type NavIcon = keyof typeof ICONS;                              // "directory"|"create-camp"|"profile"|"account"
export function NavLink({ href, icon, label }: { href: string; icon: NavIcon; label: string })
export interface ErrorRecoveryProps { error: Error & { digest?: string }; reset: () => void;
                                      title?: string; description?: string; frame?: "standalone" | "inline" }
export function ErrorRecovery(props: ErrorRecoveryProps)
export interface NotFoundViewProps { title?: string; description?: string; frame?: "standalone" | "inline" }
export function NotFoundView(props: NotFoundViewProps)
export function PageSkeleton({ rows = 2, cards = 6 }: PageSkeletonProps)
export function PreviewNotice({ feature, reason }: { feature: string; reason?: string })
export function NotConfiguredBanner()
export function MemberRefCode({ code, prominent = false }: MemberRefCodeProps)
export function JoinButton({ label }: { label: string })
export function LeaveCampButton({ slug, action }: LeaveCampButtonProps)
export function SignOutButton()
export function HeadingSkeleton({ action = false }: { action?: boolean })          // suppliers
export function PortalPageSkeleton({ cards = 2 }: { cards?: number })              // suppliers
export function NotificationFilterTabs({ filter, unreadCount })                    // suppliers
export function notificationsHref(filter: NotificationFilter): string              // suppliers
export function OnboardingChecklist({ steps, profile }: { steps: StepData[]; profile: SupplierProfile })
export function DocumentsPanel({ documents, acked, required }: DocumentsPanelProps)
```

### Repo tooling

```js
// config/security-headers.mjs
export const SECURITY_HEADERS: { key: string, value: string }[];
export async function securityHeaders();   // -> [{ source: "/:path*", headers: SECURITY_HEADERS }]
```

---

## 5. UX behaviours

### 5.1 Navigation feedback (`nav-link.tsx`)
Every destination in the donor's `(app)` group is `force-dynamic`, so a click is followed by a real round trip. `NavLinkBody` reads `useLinkStatus()` from *inside* the `<Link>` (it must be a descendant — `nav-link.tsx:60-61`) and, while pending, applies `animate-pulse opacity-60` to the icon, `opacity-60` to the label, and renders `<span className="sr-only">Loading {label}…</span>`. `prefetch` is left at `auto` so the router prefetches only down to the nearest `loading.tsx`, which is why every destination in the group *has* one.

### 5.2 Boundary chrome
`ErrorRecovery` shows title + description + `Ref {error.digest}` in a mono, uppercase, `tracking-[0.2em]` line, then **Try again** (`onClick={reset}`) and **Back to start** (`Link href="/"`). `NotFoundView` shows a `404` eyebrow, then **Browse the directory** and **Back to start**. Both accept `frame="inline"` which drops the full-height `min-h-svh` + `QuiltBand` wrapper and renders `<div className="mx-auto w-full max-w-md py-6">` instead, for a boundary nested inside a layout that already drew the chrome.

### 5.3 Supplier checklist card interaction (the state machine made visible)
`buildStepCardModel` (`apps/suppliers/lib/onboarding-view.ts:113-183`) yields exactly these UI states:

| Flow | Status | `supplierActionable` | Primary | Secondary | Status label |
|---|---|---|---|---|---|
| `org_confirmed` | any | `false` | — | — | pending ⇒ "Awaiting AfrikaBurn"; completed ⇒ "Done" |
| `self_service` | `pending` | `true` | "Mark done" → `completed` | — | "To do" |
| `self_service` | `completed` | `true` | — | "Undo" → `pending` | "Done" |
| `org_reviewed` | `pending` | `true` | "Submit for review" → `awaiting_confirmation` | — | "To do" |
| `org_reviewed` | `awaiting_confirmation` | `false` | — | "Withdraw submission" → `pending` | "Awaiting AfrikaBurn confirmation" |
| `org_reviewed` | `completed` | `false` | — | — | "Done" |

The eyebrow line encodes ownership: `"Step 3 · Org confirms"`, `"Step 1 · You complete · Auto-confirmed"`, `"Step 2 · You confirm · Org may revoke"`, `"Step 4 · You submit · Org reviews"` (`onboarding-view.ts:56-71`).
Tone styling: `done` → `bg-success/20 text-success` + `Check`; `awaiting` → `bg-warning/20 text-warning` + `Clock`; `pending` → `bg-muted text-muted-foreground` + `CircleDashed` (`onboarding-checklist.tsx:64-81`).

### 5.4 Documents panel
`requiredAck` documents carry a checkbox; a **Vercel Blob** URL gets `?download=1` appended so it downloads as an attachment rather than serving inline, but **only** when `hostname.endsWith(".blob.vercel-storage.com")` — an external "file" URL is opened as-is "we can't assume it honours the param" (`documents-panel.tsx:47-58`). The component's own comment states the boundary explicitly: "The checkbox is NOT the security boundary — `setDocumentAcknowledgement` re-resolves the session, re-checks the document's edition, and reconciles the step map from committed state" (`documents-panel.tsx:23-27`).

### 5.5 Confirm-in-place destructive action
`LeaveCampButton` uses a two-state inline confirm rather than a dialog: ghost "Leave camp" → `"Sure?"` + destructive "Leave" + ghost "Cancel", with `isPending` → `"Leaving…"` (`leave-camp-button.tsx:33-56`). Directly applicable to Camp 404 **WP1 (#125)**, which wants confirms on announcement publish and builder deletes without adding modal weight.

### 5.6 Copy-to-clipboard identifier
`MemberRefCode` has two variants: `prominent` (a bordered accent banner with the eyebrow "Your camp reference", a `font-mono text-xl` code, an explanatory line, and a Copy button that swaps to a `Check` for 1500 ms) and inline (a mono chip button with `aria-label={\`Copy reference code ${code}\`}`). Clipboard failure toasts "Couldn't copy — copy the code manually" (`member-ref-code.tsx:23-30`).

### 5.7 Filter state in the URL, not in a client handler
`NotificationFilterTabs` renders Radix `TabsTrigger asChild` wrapping a `<Link href={notificationsHref(tab)} scroll={false}>`, so "the list stays a server render and a filtered inbox is linkable/back-button-friendly"; empty `TabsContent` panels exist purely so every trigger's `aria-controls` resolves (`filter-tabs.tsx:10-14`, `:53-55`).

### 5.8 Form-with-server-action that survives sign-up
`JoinButton` is the submit button of a plain `<form action={acceptInviteAction}>` — not a fetch-and-route widget — "because the person clicking it is very often SIGNED OUT and about to be carried through sign-up. A server-side redirect is the only thing that reliably survives that journey, and the button keeps working with JavaScript disabled" (`join-button.tsx:6-15`).

### 5.9 Registration form section chrome (artwork + vehicle)
Both forms render numbered `Section` panels: `rounded-xl border bg-card p-6 text-card-foreground shadow-sm`, with a `h-7 w-7 rounded-full border-2 border-input text-xs font-semibold tabular-nums` index badge and an optional description (`artwork-registration-form.tsx:73-104`, `vehicle-registration-form.tsx:73-104` — the two are structurally identical). A `Callout` variant uses `rounded-lg border border-border bg-secondary/40 p-3 text-xs` with a `text-primary` `Info` icon (`vehicle-registration-form.tsx:107-115`). Photo upload is capped at `MAX_LAYOUT_UPLOADS = 4` (`packages/types/src/registration.ts:127`) with a **paste-a-URL fallback whenever Blob is not configured** (`blobConfigured` prop, both forms).

---

## 6. Validation and edge-case rules (digit-exact)

**Payment reference**
- Code upper-cased, stripped to `[^A-Z0-9]`, **`.slice(0, 6)`** (`payment-reference.ts:29-32`).
- Empty cleaned code ⇒ `throw new Error("Payment reference code must contain a letter or digit.")` (`:34-36`).
- Non-integer or negative sequence ⇒ `throw new Error("Payment reference sequence must be a non-negative integer.")` (`:37-41`). **Zero is legal.**
- Sequence `padStart(3, "0")`; 4+ digit sequences keep their width (`:42`).
- `deriveSubjectCode`: `.slice(0, 3) || "XXX"` (`:57`).

**Supplier code**
- Year must be an integer in **1000–9999** inclusive (`supplier-code.ts:38-40`).
- Sequence must be an integer **≥ 1** (`:41-43`) — unlike the payment reference, zero is illegal.
- `padStart(4, "0")` (`:44-47`).
- `parseSupplierCode` trims before matching (`:66`).
- `nextSupplierSequence` returns **1** for a fresh year; unparseable codes are skipped, not thrown on (`:81-88`).

**Member ref code**
- `deriveCampPrefix`: first word contributes 2 letters, each later word 1; `.slice(0, 4)`; if `< 3` chars, back-fill from `first.slice(2)`; then pad with `"X"` to 3; empty name ⇒ `"XXX"` (`member-ref-code.ts:29-40`). "Mad Hatters" → `MAH`; "The Velvet Mirage" → `THVM`.
- `disambiguateCampPrefix`: try base; then `core = base.slice(0,3)` + each of `A`–`Z`; then `core` + `2`…`999`; final fallback `${core}${takenSet.size + 1}` (`:49-66`).
- `formatMemberRefCode`: prefix upper-cased + stripped to `[^A-Z0-9]`; empty ⇒ throw; sequence integer ≥ 1 ⇒ else throw; `padStart(3, "0")` (`:69-83`).
- Regex `MEMBER_REF_RE = /^([A-Z0-9]{2,8})-M(\d{3,})$/` (`:85`).

**Supplier onboarding transitions** (`supplier-onboarding.ts:246-303`)
- `from === to` ⇒ `{ok:false, reason:"Step is already in that state."}` — **a no-op is an error, not a silent success** (`:251-253`).
- Unknown key ⇒ `` {ok:false, reason:`Unknown step: ${t.stepKey}`} `` (`:249`).
- `actor === "org"` ⇒ always `{ok:true}` (`:259`).
- Supplier + `self_service`: only `pending↔completed`; else `"A supplier can only mark this step done or not done."`
- Supplier + `org_reviewed` + `to === "completed"` ⇒ `"AfrikaBurn must review and confirm this step — you can submit it, but not mark it complete."`; otherwise only `pending↔awaiting_confirmation`; else `"You can only submit or withdraw this step for review."`
- Supplier + `org_confirmed` ⇒ `"Only AfrikaBurn can confirm this step."`

**Document binding** (`supplier-documents.ts:161-176`)
- `stepKey == null` ⇒ ok.
- Unknown key ⇒ `` `Unknown onboarding step: ${stepKey}` ``.
- Non-self-service step ⇒ `` `"${step.title}" is confirmed by AfrikaBurn, so a document acknowledgement can't complete it. Bind the document to a step the supplier completes themselves, or leave it unbound.` ``
- `!requiredAck` ⇒ `"A document bound to an onboarding step must require acknowledgement — otherwise nothing would ever complete the step."`

**Ack reconciliation** (`supplier-documents.ts:262-298`)
- The reconcile set is `alsoConsider` ∪ `{doc.stepKey : doc.stepKey != null && doc.requiredAck}`.
- Non-self-service steps are skipped even if they somehow appear in the set (`:275`).
- `satisfied && current !== "completed"` ⇒ complete; `!satisfied && current === "completed"` ⇒ revert.
- Every move goes through `applyStepTransition(..., "supplier", ...)`; **a rejected transition is skipped silently rather than throwing**, because reconciliation is a background consequence of an unrelated user action (`:232-236`).
- `isStepSatisfiedByAcks` returns **false** for an empty binding set (`:206-207`) — which is what makes a deleted last-document revert the step.
- `deriveDocumentAckProgress.allAcknowledged` is **vacuously true at 0 required documents** (`:110`).

**Ordering**
- `sortDocuments`: `sort` asc, then `title.localeCompare(_, "en", {sensitivity: "base"})`, then `id.localeCompare` — a three-key stable sort so two documents sharing a `sort` never swap between renders (`:64-72`).

**CSV import**
- `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`supplier-import.ts:74`); `PHONE_RE = /^[+\d][\d\s().+-]{5,}$/` (`:78`) — recognised only to document the *dropped* shape; the code literally does `void PHONE_RE;` (`:275`).
- Column indices: `COL_NAME=0, COL_CONTACT=1, COL_STATUS=2, COL_CATEGORY=3, COL_RETURNING=4, COL_FEE_PHRASE=5, COL_FEE_FLAG=6, COL_NOTE=7` (`:82-89`).
- Status mapping: `"in good standing"→good`, `"diligent first timer"→diligent_first_timer`, `"able & willing to adapt"→adapting`, `"absolute beginners"|"absolute beginner"→absolute_beginner`, default `good` (`:91-102`).
- Returning: `"yes"→returning`, `"newbie"→newbie`, default `null` (`:107-114`).
- Fee phrases: `"refundable deposit paid"→deposit_paid`, `"supplier contract signed"→agreement_signed`, `"inventory log submitted"→inventory_submitted`, `"crew passes purchased"→crew_details_submitted`, `"supplier registration fee paid"→registration_fee_paid` (`:161-172`).
- Truthy flag is the exact lower-cased string `"true"` (`:176-178`).
- A note cell equal to a single space `" "` is skipped (`:249`).
- Output joins: raw categories with `" / "`, notes with `"; "`, the two joined with `" — "`; contact = person name + `", "`-joined emails, space-separated (`:279-289`).

**Trigram similarity** (`name-dedupe.ts:31-63`)
- Padding is exactly pg_trgm's: `"  " + word + " "`, sliding a 3-char window.
- Two empty strings ⇒ `1`. Empty union ⇒ `0`.
- Threshold **0.55**.

**Camp categories**
- `normalized === ""` never conflicts (`camp-categories.ts:70`).
- Conflict message: `` `"${label}" already exists for this edition.` `` (`:110`).
- Zod failure message falls back to `"Enter a valid category."` (`:104`).

**Camp create** (`groups-store.ts`)
- Name `< 2` chars ⇒ `"Give your camp a name."` (`:826`).
- Over 60 words ⇒ `` `Description must be ${CAMP_DESCRIPTION_WORD_LIMIT} words or fewer.` `` (`:832-835`).
- Exact normalized collision ⇒ `"A camp of this kind already uses that name. Pick another."` (`:840-843`), and the same string is returned when SQLSTATE `23505` fires at insert time (`:942-945`).
- Slug retry: **5 attempts**, suffix `Math.random().toString(36).slice(2, 6)` (`:848-857`).

**Email**
- Recipients trimmed, empties filtered; empty list ⇒ `{ok:false, error:"No recipients."}` (`:47-52`).
- `RESEND_BATCH_MAX = 100` (`:12`).
- A failed chunk fails the **whole** send rather than reporting partial success as ok (`:82-83`).
- Non-2xx ⇒ `` `Resend responded ${res.status}: ${detail}` `` (`:113`).
- Id extraction: `parsed.id ?? parsed.data?.[0]?.id ?? null` (`:119`).

**Sound classification**
- `isNoAmplifiedSound`: falsy ⇒ `true`; any digit ⇒ `false`; else `/\b(no|none|acoustic|silent|zero)\b/` or `.includes("no amplif")` (`sound.ts:59-68`).
- `classifySoundLevel`: null/blank ⇒ `"unspecified"`; **first** `[1-4]` anywhere ⇒ `level_N`; else `/\b(no|none|silent|zero)\b/` or `"no amplif"` ⇒ `"none"`; else `"unspecified"` (`org-logic.ts:172-185`). Note the two predicates use *different* word sets — core includes `acoustic`, the console does not.

**Review action paths** (`org-logic.ts:50-77`)
- `from === target` ⇒ `` throw new Error(`Registration is already ${target}.`) ``.
- Direct transition preferred; else route through `under_review` when both hops are legal; else `` throw new Error(`Cannot ${action.replace("_", " ")} a registration in "${from}" state.`) ``.

**Key fingerprint**
- `for (let i = 0; i < 16; i += 2) pairs.push(hex.slice(i, i + 2))` — exactly **8** pairs from the first 16 hex chars (`keys.ts:56-58`).

---

## 7. Test coverage

**`packages/core` sweeper modules: 1,550 test lines against 1,790 source lines** — a ratio close to 1:1, with the two heaviest state machines carrying the heaviest suites (`supplier-documents.test.ts` 371 lines against 299 source; `supplier-onboarding.test.ts` 277 against 329).

Notable specifics:
- `packages/core/src/__fixtures__/ab-suppliers-sample.ts` holds the real merged-cell sheet shape, so `parseSuppliersCsv` is tested against the actual malformity it was written for, not a synthetic CSV.
- `packages/core/vitest.config.ts` enforces **per-file 100% coverage floors** on `report-sanitize.ts`, `report-screen.ts`, `medical-access.ts`, `privacy.ts`, `id-retention.ts`, `entitlements.ts` (per the donor's stack notes). None of the sweeper modules are on that list — they are covered but not ratcheted.
- **No test file exists for `sound.ts` or `placement-zones.ts`.** Confirmed by direct `wc -l` failure on `packages/core/src/__tests__/sound.test.ts` and `placement-zones.test.ts`.
- `apps/suppliers/lib/__tests__/` has **19** spec files: `account-actions`, `auth-user`, `config`, `db-handles`, `document-ack`, `documents`, `edition`, `gate`, `notification-actions`, `notifications`, `onboarding-step`, `onboarding-view`, `portal-account`, `password-reset`, `register-guards`, `report-viewer`, `session-linking`, `supplier-code`. This is the pattern worth stealing: the pure view-model (`onboarding-view.ts`) and the guard (`gate.tsx`) each have their own spec, so the 729-line component itself needs no test.
- `apps/web/lib/__tests__/` includes `client-navigation.test.ts` and `email.test.ts` and `groups-store.test.ts` — the three sweeper modules with real logic all have specs.
- `apps/org/lib/__tests__/org-logic.test.ts` covers the review state machine and `classifySoundLevel`.
- **Test-runner porting trap** (from the stack notes, confirmed here): `apps/suppliers/test/stubs/server-only.ts` exists and the vitest config aliases `"server-only"` to it. Camp 404's `apps/web/vitest.config.ts` aliases only `"@"`, so any donor module carrying `import "server-only"` — `edition.ts`, `email.ts`, `keys.ts`, `groups-store.ts`, `gate.tsx`, `supplier-step-reconcile.ts` — will throw the moment a Camp 404 vitest test imports it. **Add the alias before porting any of these.**

---

## 8. Dependency footprint

| Asset | Runtime deps | Notes |
|---|---|---|
| `payment-reference`, `member-ref-code`, `supplier-code`, `name-dedupe`, `word-count`, `sound`, `placement-zones` | **none** | pure TS, not even `@quagga/types` |
| `supplier-onboarding`, `supplier-standing`, `supplier-documents`, `supplier-import`, `camp-categories` | `@quagga/types` (type-only + one Zod schema in `camp-categories`) | `supplier-documents` also imports `./supplier-onboarding` |
| `config/security-headers.mjs` | **none** | plain ESM |
| `client-navigation.ts` | `@quagga/core` (`INVITE_RESUME_PATH` only) | `"use client"` |
| `email.ts` | global `fetch`, env `RESEND_API_KEY` | `"server-only"` |
| `keys.ts` | global `crypto.subtle` (Node 22), `Buffer` | `"server-only"`, **no npm dependency** |
| `edition.ts` | `react.cache`, `drizzle-orm`, local `db`/`config` | `"server-only"` |
| `boundary/*` | `next/link`, `lucide-react`, `@quagga/ui/{button,quilt-band,skeleton}` | `QuiltBand` and `Skeleton` are donor-only UI components |
| `app-shell.tsx` | `next/link`, `lucide-react`, `@quagga/ui/{quilt-band,report-launcher}`, `@quagga/core/report-server` | heaviest coupling in the unit |
| `nav-link.tsx` | `next/link` (**`useLinkStatus`** — Next 16), `lucide-react`, `@quagga/ui/lib/utils` | Camp 404 is on Next 16.2.11, so `useLinkStatus` is available |
| `onboarding-checklist.tsx` | `@quagga/ui/{button,input,textarea,card,toast}`, `lucide-react`, 3 local server actions | |
| `documents-panel.tsx` | `@quagga/ui/{card,badge,checkbox,toast}` | **`Checkbox` API collision** — donor's is a native `<input type="checkbox">`; Camp 404's is Radix with `onCheckedChange` |
| `filter-tabs.tsx` | `@quagga/ui/components/tabs` (Radix `@radix-ui/react-tabs ^1.1.14`) | **not installed in Camp 404** |
| `artwork-/vehicle-registration-form.tsx` | `@quagga/ui/{button,checkbox(AckRow),field,input,textarea-with-count,toast}` | `Field`, `TextareaWithCount`, `AckRow` are donor-only |
| `design/qa/*.py` | Python 3, a running Pencil app with the doc open | no pip deps |
| `supplier-step-reconcile.ts` | `@quagga/core`, `@quagga/types`, `drizzle-orm`, local `db`+`audit` | needs a transaction handle |

**New npm packages a full port would require:** `@radix-ui/react-tabs ^1.1.14` (filter tabs), `@radix-ui/react-toggle-group ^1.1.17` (`camp-members.tsx`), `@radix-ui/react-accordion ^1.2.18` (if `accordion` comes along), `@commitlint/cli ^21.2.1` + `@commitlint/config-conventional ^21.2.0` + `husky ^9.1.7` + `tsx ^4.23.5` (commit enforcement + `labels:sync`). **Nothing in the pure-core half of this unit requires a single new dependency.**

---

## 9. Verbatim excerpts — the five most valuable pieces

### 9.1 `apps/web/lib/client-navigation.ts` — the deferred push/refresh

The single most transferable bug-fix in this unit. Camp 404 uses this exact construct in `apps/web/app/questionnaires/[activationId]/runner.tsx`, the setup wizard and the builder.

```ts
/**
 * ## Why the push/refresh pair is DEFERRED a macrotask
 *
 * Every caller reaches this from inside `startTransition(async () => …)` — the
 * save happens in the transition and the navigation is what follows a
 * successful save. Called synchronously from in there, the transition is left
 * awaiting a navigation that the same-tick `refresh()` supersedes, so it never
 * settles and `isPending` stays true for good. What that looks like to a
 * participant: a Submit button stuck on "Saving…" on something that HAS been
 * saved, and no redirect. On the blocking questionnaire gate it meant being
 * held on a gate they had already cleared, with nothing to click.
 *
 * Deferring lets the transition resolve first, so the pending state clears and
 * the pair runs on its own tick. Proved by bisection on 28 Jul against a
 * production build: push-only fixed it, push+refresh-inside-transition hung,
 * push+refresh-deferred fixed it and KEPT the refresh — which matters, because
 * the refresh is what re-renders the app shell above the pushed route, and that
 * is how the navigation comes back after a gate clears (AppShell `gatedNav`).
 *
 * IT LIVES HERE, not at the call sites. The first fix deferred it inside
 * questionnaire `runner.tsx` alone, and left the identical construct live in
 * `bio-flow.tsx` — where "Save changes" on the profile bio editor stuck on
 * "Saving…" in exactly the same way. Two copies of a rule is how the
 * notification `linkApp` bug happened as well. One seam, one rule.
 */
export function navigateOnwards(router: PushRouter, href: string): void {
  if (href === INVITE_RESUME_PATH) {
    window.location.assign(href);
    return;
  }
  setTimeout(() => {
    router.push(href);
    router.refresh();
  }, 0);
}
```
`apps/web/lib/client-navigation.ts:21-55`

### 9.2 `config/security-headers.mjs` — drop-in, zero dependencies

```js
// Response security headers, shared by all three apps' next.config.ts.
//
// Added 27 Jul 2026 (audit M6): none of the three apps sent ANY of these. The
// org console was framable, so a clickjacked click could reach a destructive
// server action — `deleteSupplier` among them.
//
// Deliberately NOT a full Content-Security-Policy. A script-src policy strict
// enough to be worth having needs per-request nonces threaded through Next's
// inline bootstrap scripts, and getting it subtly wrong white-screens the app.
// `frame-ancestors` is the part that closes the reported hole and cannot break
// a page that was never meant to be framed. A full CSP is follow-up work, not a
// same-day change.

/** @type {{ key: string, value: string }[]} */
export const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/** The `headers()` entry for a Next config: every route, same set. */
export async function securityHeaders() {
  return [{ source: "/:path*", headers: SECURITY_HEADERS }];
}
```
`config/security-headers.mjs:1-41` (comments elided inside the array for length; the originals annotate each header)

### 9.3 `packages/core/src/supplier-code.ts` — whole-token email matching (a real takeover fix)

```ts
/**
 * DOES THIS CONTACT STRING NAME THIS EXACT ADDRESS?
 *
 * The account→supplier claim ("an unlinked row whose contact mentions your
 * VERIFIED address is yours") used a SQL `ILIKE '%address%'`, which is a
 * substring test — and a substring test on an email address is a takeover.
 * Every seeded contact is free-text webmail, so:
 *
 *   contact "Zizipho Gcasamba z.gcasamba@gmail.com"
 *     → register gcasamba@gmail.com, verify it, sign in, claim Poswa Logistics
 *   contact "Lenny deharnstretchtents85@gmail.com"
 *     → register harnstretchtents85@gmail.com and claim that supplier
 *
 * The shorter address is a literal substring of the longer one, both are
 * ordinary registerable Gmail addresses, and the claim writes `user_id` onto
 * the row — which hands over the supplier's onboarding, documents, standing and
 * org-internal correspondence.
 *
 * So the address is compared as a WHOLE TOKEN, case-insensitively, against the
 * addresses actually present in the string. `a@b.com` no longer matches
 * `xa@b.com`, `a@b.com.evil.net` or `a@b.comm`.
 */
export function contactNamesAddress(
  contact: string | null | undefined,
  address: string,
): boolean {
  if (!contact) return false;
  const wanted = address.trim().toLowerCase();
  if (!wanted) return false;
  const found = contact.toLowerCase().match(CONTACT_ADDRESS);
  return found ? found.includes(wanted) : false;
}
```
`packages/core/src/supplier-code.ts:113-145` (with `const CONTACT_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;` at `:105`)

### 9.4 `packages/core/src/supplier-onboarding.ts` — the actor-scoped transition validator

The reusable core of a task/checklist engine. Rename `supplier`/`org` to `member`/`captain` and this ports whole.

```ts
/**
 * Validate a single step-state transition against the self-service vs
 * org-confirmed rules. The headline invariant: a supplier can NEVER move an
 * org-confirmed step (deposit / briefing / fee), and can never mark an
 * org-reviewed step (inventory / crew) `completed` — only `awaiting_confirmation`.
 *
 * Rules by flow:
 *   self_service  (1 registration_form, 2 agreement_signed)
 *     - supplier: pending ↔ completed
 *     - org:      pending ↔ completed (org may revoke)
 *   org_reviewed  (4 inventory_submitted, 5 crew_details_submitted)
 *     - supplier: pending ↔ awaiting_confirmation (submit / withdraw); NOT completed
 *     - org:      any status → any status (review to complete, or send back)
 *   org_confirmed (3 deposit_paid, 6 briefing_attended, 7 registration_fee_paid)
 *     - supplier: nothing at all
 *     - org:      pending ↔ completed
 */
export function validateStepTransition(t: StepTransition): StepTransitionResult {
  const step = STEP_BY_KEY.get(t.stepKey);
  if (!step) return { ok: false, reason: `Unknown step: ${t.stepKey}` };
  if (t.from === t.to) {
    return { ok: false, reason: "Step is already in that state." };
  }

  const flow = stepFlow(step);

  if (t.actor === "org") return { ok: true };

  switch (flow) {
    case "self_service": {
      const allowed =
        (t.from === "pending" && t.to === "completed") ||
        (t.from === "completed" && t.to === "pending");
      return allowed
        ? { ok: true }
        : { ok: false, reason: "A supplier can only mark this step done or not done." };
    }
    case "org_reviewed": {
      if (t.to === "completed") {
        return { ok: false, reason:
          "AfrikaBurn must review and confirm this step — you can submit it, but not mark it complete." };
      }
      const allowed =
        (t.from === "pending" && t.to === "awaiting_confirmation") ||
        (t.from === "awaiting_confirmation" && t.to === "pending");
      return allowed
        ? { ok: true }
        : { ok: false, reason: "You can only submit or withdraw this step for review." };
    }
    case "org_confirmed":
      return { ok: false, reason: "Only AfrikaBurn can confirm this step." };
  }
}
```
`packages/core/src/supplier-onboarding.ts:225-303`

### 9.5 `apps/web/components/nav-link.tsx` — the serialisation trap, and the pending affordance

```tsx
/**
 * A header nav link that admits it was clicked.
 *
 * Every destination in this app is a `force-dynamic`, per-user server render, so
 * the router cannot hand back the page from a prefetch — the click is followed
 * by a real round trip. Without feedback ON THE CONTROL PRESSED, that gap reads
 * as "nothing happened", which is precisely the complaint. Next's
 * `useLinkStatus` gives us the router's own pending state, so the affordance can
 * never disagree with the navigation actually in flight.
 *
 * `prefetch` is left at its default (`auto`) deliberately. For a dynamic route
 * that means "prefetch down to the nearest `loading.tsx`" — which is why every
 * destination in the group now has one: the skeleton is already in the client
 * when the click lands, so it paints with no network at all. `prefetch={true}`
 * would instead force a FULL per-user server render of every nav destination in
 * the viewport, on every page, to save nothing the loading boundary does not
 * already cover.
 *
 * The icon arrives as a KEY, not as a component. Lucide icons are `forwardRef`
 * objects and a server component cannot serialise one across the boundary into a
 * client component — passing it builds and typechecks cleanly and then throws
 * "Functions cannot be passed directly to Client Components" on the first real
 * request. The map lives here, on the client side of the line.
 */
const ICONS = {
  directory: Compass,
  "create-camp": TentTree,
  profile: UserRound,
  account: Settings,
} as const;

function NavLinkBody({ icon, label }: { icon: NavIcon; label: string }) {
  // Must be a DESCENDANT of <Link> — useLinkStatus reads the nearest link's
  // transition, so it cannot live in the component that renders the link.
  const { pending } = useLinkStatus();
  const Icon = ICONS[icon];
  return (
    <>
      <Icon className={cn("h-4 w-4 transition-opacity", pending && "animate-pulse opacity-60")} aria-hidden />
      <span className={cn("hidden sm:inline", pending && "opacity-60")}>{label}</span>
      {pending && <span className="sr-only">Loading {label}…</span>}
    </>
  );
}
```
`apps/web/components/nav-link.tsx:7-30`, `:57-79`

### 9.6 (bonus) `apps/org/lib/supplier-step-reconcile.ts` — the "whole-edition sweep" argument

Worth quoting because the reasoning generalises to any derived-state reconciliation Camp 404 builds.

```
// WHY EVERY SUPPLIER IN THE EDITION, not just the ones who acked the changed
// document. Consider documents A and B both required and bound to the same
// step, and a supplier who acked only B: their step is `pending`. The org
// deletes A. B is now the only required document bound to that step, and it IS
// acknowledged — so the step should COMPLETE. That supplier never touched A, so
// an ack-holders-only sweep would skip them and leave the step wrong in the
// other direction. The set of suppliers a document change can affect is not the
// set who acknowledged it.
```
`apps/org/lib/supplier-step-reconcile.ts:24-33`

---

## 10. AfrikaBurn / multi-tenant coupling — what must be cut

Rated per asset. "None" means it compiles and behaves identically in a single-camp app after a scope rename.

### 10.1 Clean (no AfrikaBurn, no tenancy, no edition)

`payment-reference.ts` · `member-ref-code.ts` · `word-count.ts` · `name-dedupe.ts` · `config/security-headers.mjs` · `apps/web/lib/keys.ts` · `apps/web/lib/client-navigation.ts` (one `@quagga/core` constant import) · `apps/suppliers/lib/actions/result.ts` · `apps/suppliers/components/route-skeleton.tsx` · `commitlint.config.mjs` (swap `SCOPES`) · `.gitattributes` `*.pen -merge` rule.

`supplier-code.ts` is *structurally* clean — only the literal `"SUP"` prefix names the domain — but the `contactNamesAddress` helper exists solely for the account↔listing claim, which Camp 404 has no analogue for. Keep the code generator, drop that function or repurpose it.

### 10.2 AfrikaBurn copy, no structural coupling — rewrite strings only

- `sound.ts` — the five levels' `blurb` text names the Loud Zone and the northwest binnekring. The *pattern* (a stored-verbatim value + a short label + a one-line guidance blurb, with a predicate over the stored string) is what ports.
- `placement-zones.ts` — every zone is Tankwa Town geography. The reusable idea is `ZONES_BY_YEAR: Record<number, readonly Zone[]>` with a fallback, i.e. **per-edition configuration owned by code rather than a table**. Camp 404's `camp_settings.config` JSONB already does the same job for teams; this is the code-only variant for lists that change less often than a migration cycle.
- `supplier-standing.ts` — `standingDescription` hardcodes `suppliers@afrikaburn.com` and the phrase "AfrikaBurn" six times (`:56-72`). The 6-value vocabulary itself is AfrikaBurn's grading language.
- `supplier-onboarding.ts` — every `description` is Supplier Depot procedure; three mention `suppliers@afrikaburn.com` or the Supplier Agreement. The 7-step ordering is AfrikaBurn's.
- `camp-categories.ts` — the 8 canonical categories are generic burn-culture categories and port as-is.
- `apps/web/lib/edition.ts` — `FALLBACK_EDITION_LABEL` is `"AfrikaBurn 2027 · 26 April – 2 May 2027"`.
- `apps/web/lib/email.ts` — `DEFAULT_FROM = "AfrikaBurn Contributors <no-reply@contributors.afrikaburn.com>"` (`:13-14`).
- `apps/org/lib/labels.ts` — `en-ZA` locale + `ZAR` assumption. Fine for Camp 404 (also South African).

### 10.3 The `editions` dimension — the biggest structural cut

Every one of these is keyed on `edition_id`:

| Table | Edition coupling |
|---|---|
| `supplier_onboarding` | `uniqueIndex(supplier_id, edition_id)` — the checklist is *per year* |
| `supplier_documents` | `edition_id` FK + both indexes include it |
| `camp_categories` | `uniqueIndex(edition_id, label_normalized)` — the taxonomy is per year |
| `placement-zones.ts` | `getPlacementZones(year)` |

Camp 404 has **no `editions` table**. Collapsing it means: drop `edition_id` from the composite keys, or (better, if year-over-year history is ever wanted) recognise that `camp_settings` is a singleton and there is nowhere to hang a per-edition row. Any of these ported as-is will drag `getActiveEdition()` in with them, and `apps/web/lib/edition.ts` is 78 lines that only exist because the donor has a table Camp 404 does not.

`apps/org/lib/supplier-step-reconcile.ts` is edition-scoped in its **signature** (`reconcileEditionSupplierSteps(tx, editionId, alsoConsider, actorId)`) and in three of its four queries. Port the *algorithm*, not the function.

### 10.4 The `groups` indirection

`apps/web/lib/groups-store.ts` (1,024 lines) is almost entirely `group_id`-keyed. The salvageable pieces are the *pure* ones already listed: `slugify`, `checkCampName`'s decision shape, `prepareCampCreate`/`createCampWrites`'s read-half/write-half split, and the `23505` handling. `apps/web/components/camp-members.tsx` types its rows as `{membershipId, userId, displayName, role: MembershipRole, refCode, isViewer, roleIds}` where `MembershipRole` is the 6-value `god|org_staff|lead|admin|member|engineer` enum — Camp 404's is `captain|member` plus a derived `team_lead`, so the `ROLE_LABEL` map (`camp-members.tsx:59-66`) and every `RoleBadge` call must be re-expressed.

`memberships.ref_code` is the exception that ports *cleanly*: it is unique **per group**, and Camp 404 has exactly one group. `uniqueIndex(group_id, ref_code)` collapses to a plain `unique()` on a `users.ref_code` column, and `disambiguateCampPrefix` becomes unnecessary because there is only ever one prefix. `establishedCampPrefix` still earns its place — it is what makes every member share one prefix without storing it.

### 10.5 The org-vs-participant split

- `apps/org/lib/gate.tsx` `guardConsole` calls `orgCan(session.actor, "read")` and `orgCapabilityRefusal` — both from the org-roles permission system that exists *only* because reviewers are a different organisation from the reviewed. **Port the shape** (`{ok:true, session} | {ok:false, node}`), not the predicate. Camp 404's equivalent is `requireClearance` from `@camp404/core`.
- The `NoRolesScreen` copy (`gate.tsx:79-124`) is a masterclass in honest refusal — it distinguishes "you hold no roles" from "you hold roles that grant no read", names the held roles, and says *what to ask for*. The lesson transfers even though the two-tier model does not.
- `apps/org/lib/org-logic.ts` `REVIEW_ACTIONS` is org-reviewer vocabulary, but the *mechanism* — derive the offered buttons from a state machine rather than a hand-kept list, and re-assert every hop — maps directly onto Camp 404's `decideApprovalAction`, which **WP1 (#125)** flags as having no stale/racing-decision guard.

### 10.6 The supplier population

Camp 404 has none. `apps/suppliers` (99 files, 14 routes) and the five supplier tables should be **left behind entirely** as a product. What travels is:

- the **checklist engine** (`supplier-onboarding.ts` + `supplier-documents.ts` + `onboarding-view.ts`) with its nouns changed,
- the **guard-returns-a-node** pattern,
- the **`runAction` result convention**,
- the **shape-matching skeleton** discipline,
- the **19-spec test layout** where pure view-models and guards are tested and the 729-line component is not,
- and `documents-panel.tsx`'s Blob `?download=1` hostname check.

Also note: the donor's own simplification audit records that `apps/org` and `apps/suppliers` "are close to being the same application twice", with the `(account)` suite alone carrying **~900 duplicated lines**, and copies that have already drifted (org's `mark-all-read-button` silently lost the success toast the other two have). **Any component lifted from an app directory should be assumed to have two near-twins, one of which is already behind** — check `apps/web/components/notifications/` and `apps/suppliers/components/notifications/` against each other before choosing one.

The `apps/org/lib/email.ts` header states this outright: "BYTE-IDENTICAL TWIN of apps/web/lib/email.ts. Keep them in lockstep — the multi-recipient disclosure fixed here existed in both copies at once, which is the argument for a shared package the next time this file is touched." Camp 404 is a single app; port it once, into `packages/core` or `apps/web/lib`, and the problem never arises.

### 10.7 Design/brand

`app-shell.tsx`, `boundary/error-recovery.tsx`, `boundary/not-found-view.tsx` and `boundary/page-skeleton.tsx` all render `<QuiltBand />` — the AfrikaBurn brand motif, which hardcodes the `ab-*` colour ramp (`packages/ui/src/components/quilt-band.tsx:53,56,60`) that does not exist in Camp 404's `@theme`. **Strip or replace `QuiltBand` in all four before porting.** The `bg-success/20 text-success` / `bg-warning/20 text-warning` tone classes in `onboarding-checklist.tsx:66-79` *do* resolve against Camp 404's tokens (both `--color-success` and `--color-warning` exist there), so those port unchanged.

`design/qa/audit.py` is coupled to the donor canvas in three named ways: `ARCHIVE = {"cyMi6", "CwVWw", "OLb9g"}` (donor frame ids), `ALLOWED_FONTS = {"$font-brand", "Montserrat", "JetBrains Mono", "$font-mono"}`, and `FORBIDDEN = re.compile(r"(payment|reconcil|yoco|lorem ipsum|\bTODO\b)", re.I)` — the payment terms encode AfrikaBurn's never-holds-funds law, which is the *opposite* of Camp 404's position (Camp 404 wants a dues/finances surface, WP10). **Invert that rule; keep everything else.**

---

## 11. What I checked and dismissed

| Path / asset | Verdict |
|---|---|
| `apps/suppliers/app/**` (14 routes) | Dismissed as product. No supplier population in Camp 404. Only the `(portal)`/`(account)` route-group + `loading.tsx`/`error.tsx` **layout pattern** survives, and unit 07 (account) already owns the `(account)` half. |
| `apps/suppliers/lib/{auth,auth-client,session,session-linking}.ts` | Dismissed — bespoke Better Auth provider internals, out of scope by instruction. |
| `apps/suppliers/components/auth/*` (5 files) | Dismissed — the audit records these as near-verbatim forks of the org/web equivalents; `lib/actions/password.ts` differs in 2 of 81 non-comment lines. Unit 07 covers the account surfaces. |
| `apps/suppliers/lib/{documents,onboarding-store,supplier-code,report-viewer}.ts` | Store/adapter layer over the core modules already harvested; no independent logic worth lifting. |
| `apps/org/lib/queries.ts` (2,102 lines, 44 exports) | **Deferred to the domain units.** `getStatusBoard`/`getOverviewCounts` → status board; `getOrgRolesOverview`/`getOrgAccessRoster`/`listAssignableOrgRoles`/`getOrgRoleImpacts` → roles; `getRegistration*`/`getRoster*`/`getSectionReview*` → registration; `searchAccounts` → account/privacy; `getSuppliersOverview`/`getSupplierNotes`/`getCampCategories`/`getWrangler*` → this unit only insofar as the *tables* are documented above. The file is a read-model layer with `group_id`/`edition_id` in nearly every query — concept-only for Camp 404. |
| `apps/org/lib/{status-board,status-board-format,org-stats-adjacent}.ts` | Unit "status board". |
| `apps/org/lib/{audit,medical-audit}.ts` | Unit "audit". |
| `apps/org/lib/{system-probe,system-status}.ts` | Unit "system health". |
| `apps/org/lib/{org-role-impact,god}.ts`, `packages/core/src/{org-permissions,org-roles,org-domains,project-roles,project-permissions,officers}.ts` | Unit "roles". |
| `packages/core/src/{audience,notifications}.ts` | Units "audience" / "notifications" / "bulletins". |
| `packages/core/src/{report,report-screen,report-sanitize,report-server/**}.ts` | Unit "report". |
| `packages/core/src/{account-security,account-sanitization,auth-capabilities,security-events,security-notifications}.ts`, `packages/types/src/accounts.ts` | Unit "account". `accounts.ts` is documented here (§3.1) only because the brief listed it; its 6 Zod enums belong to the account/security unit's surface. |
| `packages/core/src/{privacy,medical-access,id-retention}.ts` | Unit "privacy". |
| `packages/core/src/questionnaire-*.ts` (7 files), `form-2.ts` | Unit "questionnaires". |
| `packages/core/src/{entitlements,registration-state,registration-sections}.ts`, `apps/web/components/registration/**` | Unit "registration". `field-kit.tsx` (605 lines) is noted here for its `Labeled` two-mode accessibility contract but belongs to that unit. |
| `packages/core/src/{invite,invite-view,god-emails}.ts`, `apps/web/lib/{invite-flow,invites-store,pending-invite}.ts` | Unit "registration"/"account" — `join-button.tsx` and `camp-invites.tsx` are noted here for their form-action pattern only. |
| `packages/core/src/{bio,username}.ts`, `apps/web/lib/bio-store.ts`, `apps/web/components/onboarding/bio-flow.tsx`, `privacy-toggles.tsx`, `profile-public/**` | Units "privacy"/"directory". |
| `apps/web/lib/{account,account-actions,account-sanitize,account-tokens,crypto-guard,medical-access}.ts`, `apps/web/components/account/**` | Unit "account". |
| `apps/web/lib/{notifications,notifications-actions,bulletins}.ts`, `apps/web/components/notifications/**` | Units "notifications"/"bulletins". |
| `apps/web/lib/{roles-store,required-actions,registration-store,project-registration-store,questionnaire-store}.ts` | Units "roles"/"questionnaires"/"registration". |
| `apps/web/components/roles/**` (7 files) | Unit "roles". |
| `apps/web/components/questionnaire/**` (11 files, incl. the **542-line dead `builder.tsx`**) | Unit "questionnaires". Flagged: `apps/org/components/questionnaire/builder.tsx` is imported by nothing, superseded by `builder-v2.tsx` in the sibling `components/questionnaires/` directory. |
| `packages/ui/src/components/**` (49 files + `markdown-editor/`) | Unit "ui components". |
| `packages/db/src/{migrate,seed,index,crypto}.ts`, `migrations/**` | Unit "db". |
| `e2e/**`, `scripts/e2e-local.sh` | Unit "e2e". `e2e-local.sh` is listed in §1g for completeness; its `rm -rf apps/*/.next/cache apps/*/.next/dev` at `:182` is the twin of Camp 404's already-landed `turbo.json` fix (commit `c270377`). |
| `.github/workflows/ci.yml` | Unit "ci". `mobile.yml` and `neon-pr-cleanup.yml` are harvested here because they are *not* the gate. |
| `docs/**` (20+ files) | Unit "docs". |
| `design/ab-initial-app.pen` (7.2 MB / 173k lines) | Donor canvas — not portable content. Camp 404 has its own finished `app.pen`. Only the **QA harness** around it (`design/qa/*.py`, `REVIEW.md`, `whitelist.json`, `.gitattributes` `-merge` rule) is harvested. |
| `design/brand/*.png` (7 files) | AfrikaBurn brand assets. Not portable. |
| `design/pen-lessons.md` (1,194 lines) | Canvas-authoring lessons. Concept-only; Camp 404's design pass is finished. |
| `AB-Discovery-Meeting-Agenda.docx` | Non-code artefact. |
| `.github/ISSUE_TEMPLATE/*.yml` (4 forms) + `pull_request_template.md` | Genuinely reusable but tied to the reporter's `GITHUB_LABELS` vocabulary (`packages/core/src/report.ts`) — unit "report" owns that seam. Listed here so it is not lost: `bug.yml`, `copy.yml`, `design.yml`, `feature.yml`, `config.yml`, and `issue-forms.test.ts` in core **tests the form definitions against the label vocabulary**. |
| `.github/CODEOWNERS` | Dismissed — the donor's own `AGENTS.md:22-24` records that branch protection on `main` is not enabled, so it "does nothing at all". |
| `packages/auth/**` | Out of scope by instruction. |
| `.npmrc` | `auto-install-peers=true`, `strict-peer-dependencies=false`, `shamefully-hoist=false`. Compare against Camp 404's before any port; not itself an asset. |

---

## 12. Gotchas for anyone porting from this unit

1. **`import "server-only"` will break Camp 404's vitest.** `edition.ts`, `email.ts`, `keys.ts`, `groups-store.ts`, `apps/org/lib/gate.tsx`, `supplier-step-reconcile.ts` all carry it. The donor aliases it to a stub in every app vitest config (`apps/suppliers/test/stubs/server-only.ts`); Camp 404's `apps/web/vitest.config.ts` does not. Add the alias first.
2. **`Checkbox` API collision.** `documents-panel.tsx:128` and the registration forms' `AckRow` use the donor's *native* `<input type="checkbox">` with `onChange={(e) => …e.currentTarget.checked}`. Camp 404's `Checkbox` is Radix with `onCheckedChange`. Every lifted call site must be rewritten, or the donor's native checkbox ported under a different name.
3. **`@radix-ui/react-tabs` and `@radix-ui/react-toggle-group` are not installed in Camp 404.** `filter-tabs.tsx` needs the first; `camp-members.tsx` needs the second.
4. **`QuiltBand` is in four of the boundary/chrome components** and carries hardcoded `ab-*` brand classes that compile to nothing in Camp 404. Remove it, do not port it.
5. **`useLinkStatus` must be used from a descendant of `<Link>`.** `nav-link.tsx:60-61` says so explicitly. Putting the hook in the component that renders the link silently reads nothing.
6. **Do not pass a Lucide icon across the server/client boundary.** It typechecks and builds, then throws "Functions cannot be passed directly to Client Components" on the first real request (`nav-link.tsx:24-30`). Pass a string key and map it on the client.
7. **Donor comments can contradict the code.** The donor's own audit found eight such cases, including a `DEPARTMENT_SCOPED_CAPABILITIES` doc comment that "says the exact opposite of the code below it". Everything in this document was read from the code, not from the comment above it — but re-verify anything you port on the same basis.
8. **`typedRoutes: true` in Camp 404's `next.config.ts`.** Every `<Link href="/directory">`, `href="/camps/new"`, `href="/auth/sign-in"` in the ported chrome will fail typecheck until a matching Camp 404 route exists. `app-shell.tsx`, `not-found-view.tsx` and `nav-link.tsx` all carry donor route literals.
9. **Semicolon drift.** Camp 404's `.prettierrc.json` sets `"semi": true`, but several of its own `packages/ui` components are written without them; donor files are uniformly semicolon'd. Run `pnpm format` after any paste.
10. **`payments.amount_cents` is nullable and `subject_type` is plain text**, not an enum column, even though a `PaymentSubjectType` Zod enum exists (`packages/types/src/payments.ts:19-23`) — kept "as an open string union so new fee sources land without a schema change" (`payments.ts:16-18`). If Camp 404 builds a dues/finances surface on this shape, the Zod enum is the only validation there is.
11. **`supplier_documents.step_key` is `text`, not an enum column** (`schema.ts:1618-1620`), deliberately, so it matches how the JSONB map stores keys. Same trade-off applies to any Camp 404 checklist built on it.
12. **`getActiveEdition` is `react.cache()`-wrapped and the dedupe is explicitly stated to carry no privacy weight** because the row is the same for everyone (`edition.ts:20-24`). Do not copy that reasoning onto a per-user read.
13. **`isNoAmplifiedSound` (core) and `classifySoundLevel` (org) use different word sets** — core includes `acoustic`, the console does not. Two near-duplicate predicates over the same stored string. If either is ported, port one and delete the other.
14. **The donor's `.env.example` is stale in three ways at once** and still declares `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` — Camp 404's own variable names, left behind. Do not treat it as a reference for anything.
