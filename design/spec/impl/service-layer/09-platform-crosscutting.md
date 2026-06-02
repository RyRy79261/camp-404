# Platform / cross-cutting (feedback, media, rate-limit, crypto, test-mode) — service-layer plan

> Scope: the cross-cutting infrastructure no single domain owns — in-app bug/feature
> reporting (shake → GitHub issue, optional AI restructure), avatar/image media
> (client crop + gated blob proxy), rate-limiting, ID-document crypto, the E2E test
> seam, boot-time env validation, cron auth, OG/icon imagery, and the new global
> overlays (Toast, error boundaries). Per the locked HYBRID decision, this domain is
> where the strongest framework-agnostic extraction candidates live (initials,
> image-resize, id-validation, rate-limit token-bucket, PII redaction / issue
> assembly, shake detector). Almost everything already exists and is REUSE; the
> redesign delta is overlay/presentation plus a few targeted hardening items.

---

## Consumers — which surfaces/organisms depend on this domain

| Consumer (surface / organism) | What it depends on here |
|---|---|
| **S25 Global overlays** (`25-global-overlays.md`) | `submitFeedbackAction`, `structureWithAi`, `buildFeedbackIssue` + PII/sanitize, `useShakeGesture`/`createShakeDetector`, `FeedbackGate`, rate-limit, `isE2ETestMode`; **NEW** Toast; error/not-found boundaries |
| **S22 Avatar upload** (`22-avatar-upload.md`) | `cropResizeToSquare` (`lib/image.ts`), `POST /api/uploads/avatar`, `GET /api/avatar`, rate-limit, `isE2ETestMode` |
| **S06 Home**, **S07 Profile view**, **S13 Family tree**, **S14 Roster** | `initialsFrom` (avatar fallback), `GET /api/avatar` proxy (display any approved member's photo), `cropResizeToSquare` indirectly via AvatarUpload |
| **S08 Profile edit**, **S04 Onboarding wizard** (`profile_photo` step) | `AvatarUpload` → `cropResizeToSquare` + upload route; `initialsFrom` placeholder |
| **S04 Onboarding wizard** (`id.number` field), **member-detail / id reveal** | `validateIdNumber` (`lib/id-validation.ts`), `encrypt`/`decrypt`/`decryptOrNull` (`packages/db/src/crypto.ts`), `splitIdNumber`/`idColumnsFor`/`mergeIdNumber` (`packages/db/src/id-documents.ts`) |
| **All authenticated surfaces** | `getAuthenticatedUser` gate + rate-limit on every action/route; the error boundaries wrap every route segment; `FeedbackGate` mounted app-wide in the root layout |
| **Cron routes** (`/api/cron/*` — push drain, maintenance backfill) | `assertCron`/`isAuthorizedCron` (`lib/cron-auth.ts`), `backfillIdEncryption` (`packages/db/src/maintenance.ts`) |
| **Boot / instrumentation** (`instrumentation.ts`) | `assertServerEnv` (`lib/env.ts`) |
| **Metadata / share / icon routes** (`opengraph-image`, `apple-icon`, `icon`) | `renderShareImage`, `renderSquareIcon` (`lib/og-image.tsx`) |
| **All E2E specs** | `testStore` (`lib/test-store.ts`), `isE2ETestMode`, `/api/test/*` routes |

---

## Current state — modules + key exports today

### `apps/web/lib/` (app orchestration; mostly Next-coupled today)

- **`github-feedback.ts`** — PURE, no I/O, already unit-tested. `redactPii(input):string`, `sanitizeReportText(text,maxLength):string`, `labelsFor(kind):string[]`, `buildFeedbackIssue(input:BuildIssueInput):BuiltIssue`; types `FeedbackKind = "bug"|"feature"`, `StructuredReport`, `BuildIssueInput`, `BuiltIssue`; consts `DESCRIPTION_MAX=5000` (exported), `TITLE_MAX=100`, `ISSUE_BODY_MAX=60_000` (module-private). Internal Markdown-injection guards `fenced`/`inlineCode`/`mdInline`. Header comment notes it is "ported from intake-tracker's redactPii" and deliberately I/O-free "so this stays unit-testable".
- **`feedback-ai.ts`** — `"server-only"`. `structureWithAi(kind, description):Promise<StructuredReport|null>`; fail-safe (any error/no-key/bad shape → `null`). Couples to `@/lib/anthropic` (`anthropic()`, `MODELS.haiku`) and Zod `StructuredSchema`. The Anthropic-tool plumbing (`FORMAT_TOOL`, `SYSTEM_PROMPT`) is server-side I/O.
- **`image.ts`** — PURE browser util (canvas/`createImageBitmap`, no `next/*`). `cropResizeToSquare(file, {size=512, quality=0.85}):Promise<Blob>`; type `CropResizeOptions`. Browser-only (DOM `document`/`canvas`) but framework-agnostic.
- **`initials.ts`** — PURE, zero deps. `initialsFrom(source:string|null):string`.
- **`rate-limit.ts`** — `rateLimit(key, {limit, windowMs?}):RateLimitResult` (in-memory `Map` token bucket, per-process, `maybeSweep` GC); `getClientIp(headers:Headers):string`; types `RateLimitOptions`, `RateLimitResult`. Header comment already plans the swap: "If/when this app fans out across regions, swap for an Upstash-backed limiter with the same signature." `rateLimit` itself is pure (no `next/*`); `getClientIp` takes a Web `Headers`.
- **`env.ts`** — `assertServerEnv(env=process.env):void`; throws if `PGCRYPTO_KEY` missing/<16 chars; no-op under `E2E_TEST_MODE=1`. Pure on inputs (reads `process.env` by default) — already unit-tested.
- **`cron-auth.ts`** — `isAuthorizedCron(authHeader, secret):boolean` (constant-time `timingSafeEqual`, fails closed) is PURE save for `node:crypto`; `assertCron(req:Request):NextResponse|null` is Next-coupled (`next/server`).
- **`test-mode.ts`** — `"server-only"`. `isE2ETestMode():boolean`; const `TEST_USER_COOKIE`.
- **`test-store.ts`** — `"server-only"`. `testStore` object (in-memory user/profile/invite/broadcast/delivery store on `globalThis`); types `TestUser`, `TestBurnerProfile`, `TestInviteCode`, `TestQuestionnaireEdit`. Only loaded under `E2E_TEST_MODE`.
- **`og-image.tsx`** — `renderShareImage():ImageResponse`, `renderSquareIcon(size):ImageResponse`; consts `SHARE_SIZE`, `SHARE_CONTENT_TYPE`, `SHARE_ALT`. Next-coupled (`next/og`).
- **`id-validation.ts`** — PURE. `validateIdNumber(type, raw):IdValidationResult` (SA-ID Luhn variant + YYMMDD prefix; passport `[A-Z0-9]{6,12}`); type `IdValidationResult`.
- **`anthropic.ts`** — `anthropic():Anthropic` (lazy singleton), `MODELS = {opus:"claude-opus-4-8", haiku:"claude-haiku-4-5-20251001"}`. Server-side SDK client (used by feedback-ai + voice + mcp).
- **`feedback-gate.tsx`** (`apps/web/app/`) — `"use client"` `FeedbackGate({aiAvailable})`; wires `useShakeGesture` + iOS motion permission + `ReportBugDialog`. React/DOM-coupled.

### `apps/web/components/feedback/`

- **`use-shake-gesture.ts`** — `"use client"`. PURE detector `createShakeDetector(config):{process(sample,now):boolean}` (rotation-invariant magnitude state machine), already unit-tested; React hook `useShakeGesture(opts)`; `motionPermissionNeeded():boolean`; `requestMotionPermission():Promise<MotionPermissionResult>`; types `ShakeSample`, `ShakeDetectorConfig`. Detector is framework-agnostic; the hook + permission helpers touch `window`/`DeviceMotionEvent`.
- **`report-bug-dialog.tsx`** — the `ReportBugDialog` UI (covered by the components plan, not here).

### `apps/web/app/feedback/`

- **`actions.ts`** — `"use server"`. `submitFeedbackAction(input:unknown):Promise<FeedbackResult>`; `FeedbackResult = {ok:true;number;url} | {ok:false;error}`; `InputSchema` Zod; `GithubIssueSchema`; const `DEFAULT_REPO="RyRy79261/camp-404"`. Orchestrates: auth gate → burst+daily rate-limit → Zod → single sanitize → reject-empty → opaque `reporterRef` → E2E short-circuit → optional `structureWithAi` → `buildFeedbackIssue` → GitHub `fetch` (8s `AbortSignal.timeout`, status mapping). Next-coupled (`getAuthenticatedUser`, server action).

### Route handlers (`apps/web/app/api/`)

- **`uploads/avatar/route.ts`** — `POST`; auth + per-user (`{limit:20}`) and per-IP (`{limit:40}`) rate-limit; FormData `image` validation (415 non-image, 413 >5 MB, 400 missing); `put(... access:"private", addRandomSuffix:true)`; returns same-origin `avatarProxyUrl(pathname)`; E2E/no-token short-circuit to deterministic `test-avatar.webp` URL. `runtime="nodejs"`.
- **`avatar/route.ts`** — `GET`; auth + `isApproved` gate; `pathname` must start with `avatars/`; `get(pathname, access:"private")` streams with `Cache-Control: private, max-age=31536000, immutable` + `X-Content-Type-Options: nosniff`; 401 / 400 / 404 otherwise. `runtime="nodejs"`.
- **`test/*`** — login/reset/seed-invite/set-rank/set-approval/complete-onboarding/inspect; all `isE2ETestMode`-gated.

### `packages/db/src/`

- **`crypto.ts`** — PURE (`node:crypto` only, no Drizzle). `encrypt(plaintext):string`, `decrypt(stored):string`, `decryptOrNull(stored):string|null`. AES-256-GCM (`base64(iv‖tag‖ciphertext)`), key = `scryptSync(PGCRYPTO_KEY, "camp404-pgcrypto-v1", 32)` cached. Throws if `PGCRYPTO_KEY` missing/<16.
- **`id-documents.ts`** — PURE mapping (no crypto, no Drizzle). `splitIdNumber(responses):SplitId`, `mergeIdNumber(responses, id)`, `idColumnsFor(idType, value)`; consts `ID_NUMBER_KEY`, `ID_TYPE_KEY`. Already unit-tested (`__tests__/id-documents.test.ts`).
- **`maintenance.ts`** — `backfillIdEncryption():Promise<{scanned;migrated}>`; idempotent per-row transactional backfill. Couples Drizzle (`createPooledDb`, `schema`) with `encrypt` + `id-documents` helpers.

### `packages/types/src/`

- No platform/cross-cutting types live here today. Feedback/shake/rate-limit/avatar types are co-located with their app modules. (See Schema & types for what — if anything — moves.)

---

## Redesign delta — NEW / EXTEND vs REUSE (most is reuse)

The spec is explicit that the feedback path, avatar path, crypto, and rate-limiter are
**already implemented and canonical** — the board sketches are enriched *up to* the
existing code (`25-global-overlays.md` §Divergences 3/5; `22-avatar-upload.md`
§Divergences). The delta is almost entirely presentation/overlay plus a few hardening
items.

**REUSE (exists, keep as-is):**
- Full feedback pipeline: `submitFeedbackAction`, `structureWithAi`, `buildFeedbackIssue`, `redactPii`/`sanitizeReportText`, `labelsFor`, all feedback consts and the rate-limit caps (`{limit:3}` burst / `{limit:20, windowMs:86_400_000}` daily). Spec §"Feedback enums/constants" enumerates them verbatim — no change.
- Shake detection (`createShakeDetector`/`useShakeGesture`), iOS motion permission, `FeedbackGate`. Spec §3 describes exactly the coded behaviour.
- Avatar upload/proxy routes, `cropResizeToSquare` (512×512 WebP q0.85), per-user/per-IP rate-limits, E2E echo. Spec §"Upload route constants" matches the code 1:1.
- Crypto (`encrypt`/`decrypt`/`decryptOrNull`), `splitIdNumber`/`idColumnsFor`/`mergeIdNumber`, `validateIdNumber`. No schema change to ID columns; no behaviour change.
- `assertServerEnv`, `cron-auth`, `isE2ETestMode`/`testStore`, `og-image`, `initialsFrom`. No change.

**EXTEND:**
- **Error boundary (`error.tsx`)** — adopt the board's mono trace-code chip surfacing `error.digest` and (proposed) a "Report" action that opens the feedback reporter pre-filled with the digest (`25-global-overlays.md` §Divergence 4 + open questions). Keep the coded recovery actions (`reset()` + "Back to camp") and focus-to-heading a11y. App-layer JSX only — no service change.
- **Rate-limit → Upstash note** — the in-memory limiter is correct for single-region single-instance, but the redesign should formalise the documented swap path. EXTEND = define a `RateLimiter` interface so the call sites (`submitFeedbackAction`, both avatar routes) are limiter-agnostic, enabling a drop-in Upstash adapter later **without** touching callers. No behaviour change now; the in-memory bucket stays the default.
- **Blob lifecycle / orphan cleanup** — flagged in both surfaces as a real gap: `addRandomSuffix:true` orphans the previous blob on every re-upload, and account anonymisation (`packages/db/src/account.ts:sanitisedUserPatch` → `profileImageUrl:null`) never deletes the blob object. EXTEND = add a cleanup seam (see Target API). This is the most substantive new server work in the domain.

**NEW:**
- **Toast** — no toast/sonner primitive exists in `@camp404/ui` (`25-global-overlays.md` §Divergence 2). NEW reusable component + a small `useToast()`/`toast()` emitter API. Status variants map to the new status tokens (success/info/warning/error). (The component shape is owned by the components plan; this plan owns only the emitter/seam if it lands in a shared package — see Hybrid extraction.)
- **QuestionnaireBlock overlay trigger** — needs a pending-blocking-`required_action` read (analogous to the ack poll). This reads `required_actions` (no schema change) and is owned by the questionnaire domain plan; listed here only because S25 co-locates it.

**DELETE:** none. No dead modules identified in this domain. (The board's "Attach a screenshot" checkbox and the legacy intake-tracker diagnostics capture are *already absent* from code — nothing to delete, per `25-global-overlays.md` §Divergence 3.)

---

## Schema & types

**Schema change: NONE in this domain.** The only redesign migration (`captain_promotion_requests` + `promotion_request_status`, per `db-impact.json`) belongs to the roster/make-captain flow, not here. Avatar storage reuses the existing `users.profile_image_url text` (nullable) and the `burner_profiles.responses` JSONB `profile.image` key. ID crypto reuses `users.passport_encrypted` / `users.sa_id_encrypted`. Feedback writes to **no** Camp 404 table (GitHub Issues is the store).

**`packages/types` additions (only if the corresponding logic is extracted to `packages/core`; otherwise these types stay co-located):**

- `FeedbackKind`, `StructuredReport`, `FeedbackResult` — move alongside `buildFeedbackIssue` if it extracts to `packages/core` (these are pure data contracts shared by the action + the dialog).
- `RateLimitOptions`, `RateLimitResult`, and a new `RateLimiter` interface (`limit(key, opts) => RateLimitResult | Promise<RateLimitResult>`) — co-located with the extracted limiter.
- `IdValidationResult` — moves with `validateIdNumber`.
- `ShakeSample`, `ShakeDetectorConfig`, `MotionPermissionResult` — `MotionPermissionResult` is currently inferred only locally; promote to an exported type if the detector extracts.

**Drizzle migration steps:** none required for this domain. (Blob cleanup is an object-store concern, not a Postgres schema change.)

---

## Target API — function/module surface after this work

Notation: **REUSE** = keep verbatim · **EXTEND** = modify · **NEW** = build · **DELETE** = remove.
`packages/core[NEW, pure]` = the new framework-agnostic package the locked plan permits.

### Pure / framework-agnostic — `packages/core` (NEW pure pkg) or `packages/db`

| Symbol | Signature | Target | Status |
|---|---|---|---|
| `redactPii` | `(input:string) => string` | `packages/core` (feedback) | **EXTEND** (move; logic unchanged) |
| `sanitizeReportText` | `(text:string, maxLength:number) => string` | `packages/core` | **EXTEND** (move) |
| `labelsFor` | `(kind:FeedbackKind) => string[]` | `packages/core` | **EXTEND** (move) |
| `buildFeedbackIssue` | `(input:BuildIssueInput) => BuiltIssue` | `packages/core` | **EXTEND** (move) |
| `initialsFrom` | `(source:string\|null) => string` | `packages/core` | **EXTEND** (move) |
| `validateIdNumber` | `(type:string\|null, raw:string) => IdValidationResult` | `packages/core` | **EXTEND** (move) |
| `cropResizeToSquare` | `(file:File, opts?:CropResizeOptions) => Promise<Blob>` | `packages/core` (browser-pure) | **EXTEND** (move; DOM-only, still framework-agnostic) |
| `createShakeDetector` | `(config:ShakeDetectorConfig) => {process(sample,now):boolean}` | `packages/core` | **EXTEND** (move; pure state machine) |
| `rateLimit` (in-memory) | `(key:string, opts:RateLimitOptions) => RateLimitResult` | `packages/core` | **EXTEND** (move; default adapter) |
| `RateLimiter` interface | `{ limit(key, opts): RateLimitResult \| Promise<RateLimitResult> }` | `packages/core` / `packages/types` | **NEW** (seam for Upstash) |
| `createUpstashRateLimiter` | `(redis) => RateLimiter` | `packages/core` (optional adapter) | **NEW** (deferred until multi-region; stub/no-op acceptable now) |
| `encrypt` / `decrypt` / `decryptOrNull` | as today | `packages/db/src/crypto.ts` | **REUSE** (already in db; node:crypto pure — keep) |
| `splitIdNumber` / `mergeIdNumber` / `idColumnsFor` | as today | `packages/db/src/id-documents.ts` | **REUSE** |
| `assertServerEnv` | `(env?:Record<string,string\|undefined>) => void` | `packages/core` (or keep in app) | **EXTEND** (pure-on-inputs; safe to move, but low value — see Hybrid) |
| `isAuthorizedCron` | `(authHeader:string\|null, secret:string\|undefined) => boolean` | `packages/core` | **EXTEND** (move; `node:crypto`, no `next/*`) |

### Next-coupled — STAY in `apps/web/lib` / `apps/web/app`

| Symbol | Signature | Target | Status |
|---|---|---|---|
| `submitFeedbackAction` | `(input:unknown) => Promise<FeedbackResult>` | `apps/web/app/feedback/actions.ts` | **EXTEND** (re-import pure parts from `packages/core`; orchestration unchanged) |
| `structureWithAi` | `(kind, description) => Promise<StructuredReport\|null>` | `apps/web/lib/feedback-ai.ts` | **REUSE** (server-only Anthropic I/O) |
| `getClientIp` | `(headers:Headers) => string` | `apps/web/lib/rate-limit.ts` (re-export) | **REUSE** (Web `Headers`; pure but request-shaped — keep at edge) |
| `assertCron` | `(req:Request) => NextResponse\|null` | `apps/web/lib/cron-auth.ts` | **REUSE** (`next/server`) |
| `isE2ETestMode` | `() => boolean` | `apps/web/lib/test-mode.ts` | **REUSE** (`server-only`) |
| `testStore` | object | `apps/web/lib/test-store.ts` | **REUSE** (`server-only`, globalThis singleton) |
| `renderShareImage` / `renderSquareIcon` | `() => ImageResponse` / `(size) => ImageResponse` | `apps/web/lib/og-image.tsx` | **REUSE** (`next/og`) |
| `useShakeGesture` / `motionPermissionNeeded` / `requestMotionPermission` | hooks/DOM helpers | `apps/web/components/feedback/use-shake-gesture.ts` | **REUSE** (React/`window`/`DeviceMotionEvent`) |
| `FeedbackGate` | `({aiAvailable}) => JSX` | `apps/web/app/feedback-gate.tsx` | **REUSE** |
| `POST /api/uploads/avatar` | route handler | `apps/web/app/api/uploads/avatar/route.ts` | **EXTEND** (orphan cleanup on re-upload — see below) |
| `GET /api/avatar` | route handler | `apps/web/app/api/avatar/route.ts` | **REUSE** |
| `deleteAvatarBlobs` | `(userId:string) => Promise<void>` | `apps/web/lib/avatar-blob.ts` (NEW, `@vercel/blob` `list`+`del`) | **NEW** (orphan/anonymisation cleanup) |
| `Toast` + `toast()`/`useToast()` | component + emitter | `@camp404/ui` (component) | **NEW** (component plan owns the JSX; emitter is React-coupled) |
| `error.tsx` / `global-error.tsx` / `not-found.tsx` | Next file-convention | `apps/web/app/` | **REUSE** + **EXTEND** (trace chip + Report action) |
| `anthropic` / `MODELS` | `() => Anthropic` / const | `apps/web/lib/anthropic.ts` | **REUSE** |

---

## Hybrid extraction

The locked rule: pure/framework-agnostic logic MOVES to packages; anything importing
`next/*`, `server-only`, auth/session, or that is a route/action STAYS in app. This
domain is the richest source of clean extraction candidates because so much was
*deliberately written I/O-free for testability* (the file comments say so).

### MOVE to `packages/core` (NEW pure package) — strongest candidates

1. **`github-feedback.ts` (whole file).** Header: "No I/O here … so this stays unit-testable." Zero `next/*`/`server-only`. `redactPii`/`sanitizeReportText`/`buildFeedbackIssue`/`labelsFor` + the Markdown-injection guards are pure string transforms shared by the server action AND the dialog (`DESCRIPTION_MAX`). **Target:** `packages/core/feedback`. Types (`FeedbackKind`, `StructuredReport`, `BuildIssueInput`, `BuiltIssue`) follow into `packages/types` or re-export from core. Tests (`__tests__/github-feedback.test.ts`) move with it.
2. **`initials.ts`.** Zero-dep pure string fn used by the home header, profile, and (logically) any avatar fallback. **Target:** `packages/core/text` (or `packages/ui` since it's display-adjacent — but it's pure logic, so core).
3. **`image.ts` (`cropResizeToSquare`).** Browser-only (canvas/`createImageBitmap`) but framework-agnostic — no `next/*`, no React. Listed by the brief as a top extraction target. **Target:** `packages/core/media` (mark as a browser-environment export). Consumed by `AvatarUpload`.
4. **`id-validation.ts` (`validateIdNumber`).** Pure SA-ID/passport validation, no deps. Pairs naturally with the already-in-`packages/db` `id-documents.ts` mapping helpers. **Target:** `packages/core/id` (keeping the *crypto* and *column-mapping* in `packages/db` where they sit today, since `id-documents.ts` is data-access-adjacent and already there). This co-locates client-side validation with the shared types while leaving DB-coupled mapping in db.
5. **`rate-limit.ts` `rateLimit` + the token-bucket.** Pure (Map-based, no `next/*`). Brief explicitly calls out "rate-limit token-bucket → packages/core" and the file already plans the Upstash swap "with the same signature." **Target:** `packages/core/rate-limit`, behind a `RateLimiter` interface so the Upstash adapter is a later drop-in. **Keep `getClientIp` at the edge** (`apps/web/lib/rate-limit.ts` re-export) — it's request-shaped and only ever called from route handlers.
6. **`createShakeDetector`** (the pure state machine inside `use-shake-gesture.ts`). Already unit-tested without the DOM. **Target:** `packages/core/shake`. **Leave** `useShakeGesture`, `motionPermissionNeeded`, `requestMotionPermission` in the app component — they touch `window`/`DeviceMotionEvent`/React.
7. **`isAuthorizedCron`** (the constant-time compare). `node:crypto` only, no `next/*`. **Target:** `packages/core/auth-utils`. **Leave** `assertCron` (returns `NextResponse`) in the app.

### Already correctly placed in `packages/db` — keep (REUSE, do NOT move)

- **`crypto.ts`** (`encrypt`/`decrypt`/`decryptOrNull`) — pure `node:crypto`, but it's server-side secret-handling tied to the encrypted `users` columns and `maintenance.ts` backfill. It belongs with the data layer it serves; no benefit to a second hop into core.
- **`id-documents.ts`** (`splitIdNumber`/`idColumnsFor`/`mergeIdNumber`) — pure, but it maps directly onto schema columns and is consumed by `maintenance.ts` + the questionnaire save path; keep adjacent to schema.
- **`maintenance.ts`** (`backfillIdEncryption`) — Drizzle-coupled; stays in db.

### STAY in app — Next-coupled / server-only / route handlers / auth-session

- `submitFeedbackAction` (`"use server"`, `getAuthenticatedUser`) — orchestration only; after extraction it imports the pure pieces from `packages/core` and keeps the GitHub `fetch`, env reads, auth gate, rate-limit *call*, and E2E short-circuit.
- `feedback-ai.ts` (`server-only`, Anthropic SDK I/O) — stays. (Its Zod *schema* could be shared, but the tool plumbing + network call are server I/O.)
- `og-image.tsx` (`next/og`), `assertCron` (`next/server`), `test-mode.ts` + `test-store.ts` (`server-only`, globalThis E2E seam), avatar routes (`next/server` + `@vercel/blob` + auth/approval gates), `FeedbackGate` + the shake hook (React/DOM), `anthropic.ts` (server SDK client).
- **`assertServerEnv`** — pure-on-inputs and *could* move, but it's invoked once from `instrumentation.ts` and encodes app-specific required-var policy. **Recommendation: leave in `apps/web/lib`** (low extraction value, not shared). Listed as EXTEND-optional only.

### Justification summary

The cut line is: *does it import `next/*`, `server-only`, React, auth/session, or perform
I/O?* If no → core (testability + future reuse by `apps/admin-cli`, which already has its
own `__tests__`). If yes → app. Crypto/id-mapping are the deliberate exception: pure, but
schema-bound, so they live with `packages/db` per the HYBRID rule's "or into
packages/db/types where it fits."

---

## Build steps (ordered)

> Plan docs only — no code in this pass. Steps are sequenced so each is independently
> shippable behind green CI; pure-logic moves first (lowest risk), server hardening last.

1. **Scaffold `packages/core` (pure).** Create the package (TS project refs, `package.json`, no `next`/React deps). **Acceptance:** `pnpm build` + typecheck pass with an empty barrel; CI graph includes it. **Test:** package builds in isolation.
2. **Extract feedback pure logic** (`github-feedback.ts` → `packages/core/feedback`). Move file + `__tests__/github-feedback.test.ts`; re-point `submitFeedbackAction` and `report-bug-dialog.tsx` imports; keep a thin re-export shim from `apps/web/lib/github-feedback.ts` if needed to minimise churn. **Acceptance:** existing `github-feedback.test.ts` passes unchanged from its new home; `apps/web/app/feedback/actions.test.ts` still green. **Test:** reuse existing suite (redactPii, buildFeedbackIssue, labelsFor, sanitize).
3. **Extract `initials`, `id-validation`, `createShakeDetector`, `cropResizeToSquare`** to core. Move `use-shake-gesture.test.ts`'s detector cases with the detector. **Acceptance:** all moved units' existing tests pass; consumers compile. **Test:** existing `use-shake-gesture.test.ts` (detector) + new unit tests for `initialsFrom` and `validateIdNumber` (currently has none — add when moving, see gaps).
4. **Extract rate-limit behind `RateLimiter` interface.** Move `rateLimit` + token-bucket to `packages/core/rate-limit`; define `RateLimiter`; keep `getClientIp` in app re-export. Call sites (`submitFeedbackAction`, both avatar routes) take a `RateLimiter` (default = in-memory). **Acceptance:** `components/__tests__/rate-limit.test.ts` passes against the moved module; feedback + avatar rate-limit behaviour unchanged (3/min burst, 20/day, 20+40 avatar). **Test:** existing rate-limit suite; add an interface-conformance test.
5. **Extract `isAuthorizedCron`** to `packages/core/auth-utils`; leave `assertCron` in app importing it. **Acceptance:** `lib/__tests__/cron-auth.test.ts` passes from the moved location. **Test:** existing suite (fails-closed, length-guard, constant-time path).
6. **Blob lifecycle / orphan cleanup (server hardening).** Add `apps/web/lib/avatar-blob.ts` → `deleteAvatarBlobs(userId)` using `@vercel/blob` `list({prefix:`avatars/${userId}/`})` + `del(urls)`. Wire it (a) into `POST /api/uploads/avatar` to delete prior blobs after a successful new `put` (or switch to deterministic pathname without `addRandomSuffix` — decide per open question), and (b) into account anonymisation alongside `sanitisedUserPatch` setting `profileImageUrl:null`. **Acceptance:** re-upload leaves exactly one live blob per user; anonymisation removes the blob; E2E/no-token mode is a no-op (no network). **Test:** unit-mock `@vercel/blob` `list`/`del`; assert called with the right prefix and that test-mode short-circuits.
7. **Rate-limit Upstash adapter (deferred, interface-only now).** Document `createUpstashRateLimiter(redis):RateLimiter` as the multi-region drop-in; ship a stub/no-op or leave unimplemented behind the interface. **Acceptance:** interface compiles; in-memory remains default; no runtime dependency added until a region fan-out is real. **Test:** type-level conformance only.
8. **Error-boundary EXTEND.** Add the mono `error.digest` trace chip to `error.tsx`; (proposed) a "Report" affordance that opens the feedback reporter pre-filled with the digest — requires a boundary-reachable reporter entry since `FeedbackGate` mounts on success paths only (`25-global-overlays.md` open question). **Acceptance:** `components/__tests__/error-pages.test.tsx` extended to assert the trace chip renders and recovery actions still work; focus-to-heading preserved. **Test:** extend existing `error-pages.test.tsx`.
9. **Toast (NEW).** Owned primarily by the components plan (`@camp404/ui` primitive — sonner vs bespoke is an open question). Service-layer scope: if a shared `toast()` emitter lands, ensure it carries no `next/*` coupling and maps to the new status tokens. **Acceptance:** Toast renders all four status variants + with/without action; auto-dismiss + Undo wiring. **Test:** new component test in `packages/ui/src/lib/__tests__`.

**Existing tests to preserve (do not regress):** `apps/web/components/__tests__/rate-limit.test.ts`, `apps/web/lib/__tests__/{github-feedback,feedback-ai,cron-auth,env,id-documents}.test.ts`, `apps/web/app/feedback/actions.test.ts`, `apps/web/components/feedback/__tests__/{use-shake-gesture,report-bug-dialog}.test.tsx`, `apps/web/components/__tests__/error-pages.test.tsx`. Each moved module's suite moves *with* it so coverage never drops during extraction.

**Test gaps to fill on extraction:** `initialsFrom` and `validateIdNumber` have no dedicated unit tests today (they're exercised only indirectly); add focused suites when they land in `packages/core`. `cropResizeToSquare` is canvas-dependent (jsdom-limited) — cover the centre-crop math + error paths with a mocked canvas, leave the encode path to e2e.

---

## Cross-domain dependencies

- **Auth / session** (auth-session domain): `submitFeedbackAction`, both avatar routes, and `FeedbackGate` all gate on `getAuthenticatedUser` / `authClient.useSession()`. `GET /api/avatar` additionally calls `findCampUserByAuthId` + `isApproved` (users/access-control domain). These stay in app and are NOT extracted.
- **Users / access-control** (`lib/users.ts`): avatar GET approval gate; feedback `reporterRef` via `findCampUserByAuthId` (falls back to `"unlinked"`).
- **Account / data-deletion** (`packages/db/src/account.ts`): blob cleanup (step 6) must be invoked alongside `sanitisedUserPatch` on anonymisation — coordinate with the account/maintenance domain so `profileImageUrl:null` and `deleteAvatarBlobs(userId)` happen together.
- **Questionnaire / required-actions** (questionnaire domain): owns the QuestionnaireBlock overlay trigger (reads `required_actions`, no schema change) co-located in S25; owns the `id.number`/`id.type` save path that consumes `splitIdNumber`/`idColumnsFor` + `encrypt`. `validateIdNumber` (extracted to core) is consumed by the questionnaire field renderer (S20).
- **Voice** (`components/voice/recorder-panel.tsx`): `ReportBugDialog` embeds `RecorderPanel` for dictation (consumer relationship; the recorder is owned by the voice domain).
- **AI / Anthropic** (`lib/anthropic.ts`, `packages/ai-prompts`): `structureWithAi` depends on `anthropic()`/`MODELS.haiku`; `aiAvailable` is derived from `ANTHROPIC_API_KEY` presence and threaded to `FeedbackGate`/`ReportBugDialog`.
- **Notifications** (notifications domain): owns the AckTakeover overlay and the `popup`/`feed` presentations co-located in S25; only the *Toast* (transient confirmation) and the `popup`-vs-Toast ownership question touch this domain (flagged in S25 open questions).
- **DB / schema** (`packages/db`): no schema change here; crypto + id-documents + maintenance stay in db and are consumed by the questionnaire and account domains.
- **OG / metadata routes**: `renderShareImage`/`renderSquareIcon` consumed by `opengraph-image`/`apple-icon`/`icon` route files (landing/brand domain).
- **CI / green-merge**: per the memory note, sequence each extraction as its own green-CI-clean change; do not strand post-green follow-ups.

WROTE design/spec/impl/service-layer/09-platform-crosscutting.md
