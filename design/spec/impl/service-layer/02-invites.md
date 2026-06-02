# Invite codes — mint, redeem, availability — service-layer plan

> Scope: the invite-code domain — minting a code (`/tools/invite`, S14), redeeming
> a code at the post-auth gate (`/signup/required`, S03), and the live
> availability oracle. **No schema change in this domain** (`_analysis/db-impact.json`
> entry `invite_codes`: "NO schema change … The redesign is satisfied entirely at
> the app layer"). The work here is almost entirely **REUSE**, with a small set of
> pure-logic **EXTRACT** moves to `packages/core` and a handful of copy/token
> reconciliations that are presentation-layer (not in scope for this service plan,
> but cross-referenced).

---

## Consumers — which surfaces / organisms depend on this domain

| Surface / consumer | Route | What it needs from this domain |
|---|---|---|
| **Invite tool** (S14) | `/tools/invite` | mint (`createInviteAction` → `createInviteCode`), availability oracle (`/api/tools/invite/check` → `findInviteCodeByCode`), slug generation (`generateInviteCode`), slug syntax validation (`isSyntacticallyValidCode`), unused-code retry (`generateUnusedCode`). |
| **Invite gate** (S03) | `/signup/required` | redeem (`submitInviteCode` → `redeemInviteForUser` → `claimInviteCode` → `consumeInviteCode`), env-code precedence (`isEnvCode`), rate-limit. |
| **Home gating spine** | `app/page.tsx` | reads `hasCampAccess(campUser, primaryEmail)` (invite-gate evidence: `users.invite_code` non-null OR god email) to decide whether to route onward to onboarding/approval/home. |
| **Tools hub** (S13) | `/tools` | links to `/tools/invite`; carries the stale "Mint a single-use code" copy that this redesign must fix (presentation copy, not service logic). |
| **Family tree** | `/family-tree` | reads invite provenance via `invite_codes.created_by_user_id` → `users.invite_code` join (who-brought-whom). Read-only consumer of data this domain writes; the join lives in the roster/lineage domain. |
| **Access-control gates** (cross-cutting) | many | every authenticated app surface ultimately depends on `hasCampAccess` / `isApproved`, both downstream of a successful redemption. |
| **Test harness** | E2E + API | `apps/web/app/api/test/seed-invite/route.ts` seeds codes; `invite-tracking.spec.ts` asserts redemption + provenance. |

---

## Current state — modules + key exports today

### `packages/db` (schema + data-access — framework-agnostic already)

- **`packages/db/src/schema.ts:312-342`** — `inviteCodes` pgTable. Columns: `code` (text PK), `createdByUserId` (uuid → `users.id` ON DELETE SET NULL, idx `invite_codes_created_by_idx`), `note` (text), `maxUses` (int, nullable = unlimited), `useCount` (int NOT NULL default 0), `expiresAt` (timestamp, nullable), `revokedAt` (timestamp, nullable), `assignedRank` (`rankEnum`, nullable), `invitedEmail` (text, nullable, lowercased on insert), `requiresApproval` (bool NOT NULL default false), `createdAt` (timestamp NOT NULL defaultNow()).
- **`packages/db/src/invite-codes.ts`** — per-domain data-access module. Exports:
  - `type AssignedRank = "captain" | "member"` (`:5`).
  - `interface InviteCodeRow` (`:7-19`) — the row shape returned by every function here.
  - `findUsableInviteCode(code) → Promise<InviteCodeRow | null>` (`:26-50`) — predicate read: not revoked, not expired (`expiresAt > now` strict), uses remaining (`maxUses > useCount` or null). Used by the test store's parallel impl, not directly by the gate in prod (the gate goes through `consumeInviteCode`).
  - `consumeInviteCode(code) → Promise<InviteCodeRow | null>` (`:57-81`) — **atomic redeem**: single guarded `UPDATE … SET use_count = use_count + 1 WHERE <all usability predicates> RETURNING`. Race-safe; returns null for the race-loser.
  - `createInviteCode(input) → Promise<InviteCodeRow>` (`:83-109`) — mint insert; re-lowercases `invitedEmail`; defaults nullable knobs; throws on failed insert.
  - `findInviteCodeByCode(code) → Promise<InviteCodeRow | null>` (`:119-129`) — existence check **regardless** of revoked/expired/exhausted state. Powers the availability hint + the mint-time uniqueness pre-check + `generateUnusedCode`'s retry loop.

### `apps/web/lib` (orchestration — mixed pure vs Next-coupled)

- **`apps/web/lib/invite-words.ts`** — **pure module, zero Next imports.** Exports:
  - `generateInviteCode() → string` (`:45-47`) — `Math.random`-based silly-slug generator (`adjective-noun-noun`); can collide (incl. `neon-yak-yak`).
  - `isSyntacticallyValidCode(raw) → boolean` (`:57-60`) — length 3-48 + `CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/` (`:55`).
  - `CODE_RULES_HINT` (`:62-63`) — the shared hint string "3–48 chars, lowercase letters / digits / hyphens (no spaces)."
- **`apps/web/lib/access-control.ts`** — `import "server-only"`. Exports:
  - `interface ClaimedInvite` (`:10-15`).
  - `isGodEmail(email) → boolean` (`:28-32`) — reads `process.env.GOD_EMAILS`.
  - `claimInviteCode(code) → Promise<ClaimedInvite | null>` (`:43-57`) — env-code precedence (`isEnvCode`), else atomic `consumeDbCode`. **Pure-ish logic, but reads `process.env` + routes to test store.**
  - `isEnvCode(code) → boolean` (`:59-61`, private) — reads `process.env.INVITE_CODES`.
  - `consumeDbCode(code)` (`:63-68`, private) — test-store vs `dbConsumeInviteCode` switch.
- **`apps/web/lib/users.ts:111-153`** — `redeemInviteForUser(authUser, rawCode) → Promise<RedeemInviteResult>` — the redemption **orchestrator**: idempotent re-entry (god / already-has-code), `claimInviteCode`, then `createUser` (first-time) or `setUserInviteCode`/`setUserRank`/`setUserApprovalStatus` (existing). Calls `seedBurnerProfileAction`. Routes through `testBackend`/`realBackend`. `hasCampAccess(campUser, primaryEmail)` lives here too (`:218+`).

### `apps/web/app` (Next-coupled server actions + route handlers)

- **`apps/web/app/tools/invite/actions.ts`** — `"use server"`. `createInviteAction(_prev, formData) → Promise<CreateInviteResult>` (`:48-144`): auth → `ensureCampUser` → `hasCampAccess` gate → captain recompute → field parsing/validation (`EMAIL_PATTERN` `:24`, `MAX_USES_LIMIT = 100` `:28`) → `findInviteCodeByCode` uniqueness pre-check → `createInviteCode`. Private `generateUnusedCode()` (`:146-155`): 8-retry loop over `generateInviteCode` + `findInviteCodeByCode`, then timestamp-suffix fallback.
- **`apps/web/app/signup/required/actions.ts`** — `"use server"`. `submitInviteCode(_prev, formData) → Promise<SubmitInviteResult>` (`:17-43`): `getAuthenticatedUserOrRedirect` → `rateLimit("invite-redeem:<id>", {limit:10, windowMs:600_000})` → `redeemInviteForUser` → `redirect("/")` on success.
- **`apps/web/app/api/tools/invite/check/route.ts`** — `runtime = "nodejs"`. `GET(req)`: auth → `rateLimit("invite-check:<id>", {limit:30, windowMs:60_000})` → parse `?code` → `isSyntacticallyValidCode` → existence read (`testStore.findUsableInviteCode` in E2E **vs** `findInviteCodeByCode` in prod — the prod/test divergence flagged in S14 §"Validation & edge cases"). Returns `{available, reason?, hint?}`.
- **`apps/web/app/api/test/seed-invite/route.ts`** — test-only seeding route.
- Client components (presentation, out of scope for service layer): `tools/invite/invite-form.tsx`, `signup/required/invite-gate-form.tsx`.

### `packages/types`

- **No invite types exist today.** `packages/types/src/roles.ts:5` defines `Rank = z.enum(["captain","team_lead","member"])`. Note: this differs from `db/invite-codes.ts:5` `AssignedRank = "captain" | "member"` — `team_lead` is a derived rank, never stored on `invite_codes.assigned_rank` (`assigned_rank` only ever holds captain/member/NULL; this surface always writes NULL anyway).

### Tests in place

- **E2E:** `apps/web/tests/e2e/invite-tracking.spec.ts` — env-code redemption persists on the user row; DB-code provenance tracks back to the issuer. Helpers: `redeemInviteAtGate` (`tests/e2e/_helpers.ts`).
- **Test store:** `apps/web/lib/test-store.ts` — `seedInviteCode` (`:313`), `findUsableInviteCode` (`:339`), `consumeInviteCode` (`:347`) mirror the DB module (with the documented `expiresAt` boundary asymmetry: SQL `> now` vs store `<= now`).
- **No unit tests today** for `invite-words.ts` (pure, trivially testable) or `access-control.ts` / `createInviteAction` / `redeemInviteForUser`. This is the test gap to close (see Build steps).

---

## Redesign delta — NEW / EXTEND vs REUSE

Per `db-impact.json` and S14 §"Data & enums": **the schema already models every redesign feature.** Named multi-use slug codes, the optional note, the atomic use-count consume, `requires_approval`, and `assigned_rank` are all live columns. So the redesign of this domain is:

- **REUSE (the vast majority):** `inviteCodes` schema, all five `invite-codes.ts` data-access functions, all three `invite-words.ts` pure functions, `claimInviteCode` + env-code precedence, `redeemInviteForUser`, `consumeInviteCode` atomicity, both rate-limit calls, both server actions, the check route's mechanics. Nothing in the data/redemption/availability path needs to change behaviourally.
- **EXTEND (small):**
  1. **Hint-string single source** (S14 OQ #3): the client effect hardcodes "3–48 chars, lowercase letters / digits / hyphens." while the API/server uses `CODE_RULES_HINT` "…(no spaces).". Collapse to one constant. This is a `packages/core` (or `invite-words`) constant + a consumer edit — minor.
  2. **Check-route prod/test existence semantics** (S14 OQ #4 / db-impact note): prod `findInviteCodeByCode` treats revoked/expired/exhausted codes as "taken"; E2E `findUsableInviteCode` treats them as "available". Decide one rule and apply it consistently in the check route. Recommend: availability = "is this PK already claimed by any row" → use `findInviteCodeByCode` semantics in **both** modes (a dead code's name is still permanently reserved by the PK), so the test store needs a `findInviteCodeByCode`-equivalent. This is a behaviour reconciliation, EXTEND on the test store.
  3. **Optional 7-day expiry on mint** (db-impact `invite_codes.expires_at`, S24 primitive-kit copy "Invites expire after 7 days"): the column exists; `createInviteAction` currently never sets `expiresAt`. **Product decision required** before build — if adopted, it's a one-line `expiresAt: now + 7d` in the mint path. Listed as deferred/optional; NOT assumed.
- **NEW:** none in the data or service path. The genuinely-new UI pieces (`AvailabilityHint`, `CaptainOptions`, `Stepper`, `SuccessPanel`, `InviteForm`) are presentation components, covered by the surface plan, not this service plan.
- **DELETE:** none. No dead invite code identified. (The legacy `CAMP-XXXX-XXXX` placeholder on S03 is **copy**, not code — reconcile in the surface, not here.)

---

## Schema & types

### Schema change

**NONE.** Confirmed against `packages/db/src/schema.ts:312-342` and `_analysis/db-impact.json`. The only schema change in the entire redesign is `captain_promotion_requests` (roster domain) — not this domain. No Drizzle migration for invites.

### `packages/types` additions

The domain works today with `AssignedRank`/`InviteCodeRow` defined locally in `packages/db/src/invite-codes.ts`. Two **optional, low-priority** additions to consider when extracting pure logic (do them only if it removes duplication, not for its own sake):

- **`InviteCodeSyntax` / shared code constants** — if the hint-string + `CODE_PATTERN` + length bounds move to `packages/core` (below), no `packages/types` entry is needed; they're values, not types.
- **Availability transport types** — the check route's `{ available, reason: "empty"|"invalid"|"taken", hint? }` and the client `availability` union (`idle | checking | available | taken | invalid`) are transport/UI-only (S14 §"Data & enums" marks both NEW, UI/transport-only). If shared between the route handler and the client, a `packages/types` Zod schema (`InviteCheckResult`) is a reasonable home; otherwise leave them inline. **Recommend inline** unless the client and route start drifting — keep the surface area small.

No persisted-type changes. `AssignedRank` stays where it is (data-access local); it does not need to move to `packages/types/roles.ts` because it is a strict subset of `Rank` already exported there, and only the data-access layer constructs it.

---

## Target API — function/module surface after this work

Legend: **REUSE** (exists, keep as-is) · **EXTEND** (modify) · **NEW** (build) · **DELETE**. Location: `packages/db` (schema + data-access) · `packages/core` [NEW package, pure, framework-agnostic] · `packages/types` · `apps/web/lib` [Next-coupled / server-only / app orchestration] · `apps/web/app` [server actions + route handlers].

### Data access — `packages/db/src/invite-codes.ts`

| Symbol | Signature | Disposition |
|---|---|---|
| `InviteCodeRow` | interface | **REUSE** |
| `AssignedRank` | `"captain" \| "member"` | **REUSE** |
| `findUsableInviteCode(code)` | `string → Promise<InviteCodeRow \| null>` | **REUSE** |
| `consumeInviteCode(code)` | `string → Promise<InviteCodeRow \| null>` (atomic) | **REUSE** |
| `createInviteCode(input)` | `{code, createdByUserId, note?, maxUses?, expiresAt?, assignedRank?, invitedEmail?, requiresApproval?} → Promise<InviteCodeRow>` | **REUSE** |
| `findInviteCodeByCode(code)` | `string → Promise<InviteCodeRow \| null>` | **REUSE** |

### Pure logic — `packages/core` [NEW package, no Next/server-only imports]

| Symbol | Signature | Disposition |
|---|---|---|
| `generateInviteCode()` | `() → string` | **EXTEND** (move from `apps/web/lib/invite-words.ts`; behaviour unchanged) |
| `isSyntacticallyValidCode(raw)` | `string → boolean` | **EXTEND** (move; behaviour unchanged) |
| `CODE_RULES_HINT` | `string` constant | **EXTEND** (move; becomes the single source for the client hint too — fixes OQ #3) |
| `INVITE_CODE_MIN` / `INVITE_CODE_MAX` / `CODE_PATTERN` | exported constants | **NEW** (extract the inline `3`/`48`/regex so client + server + tests share them; tiny) |
| `isEnvCodeMatch(code, csv)` | `(string, string[]) → boolean` | **NEW** (pure core of `isEnvCode`; the `process.env` read stays in app — see Hybrid) |

> Note: per the LOCKED hybrid decision, the new pure home is **`packages/core`** ("a new packages/core, or into packages/db/types where it fits"). `invite-words` logic is pure and UI/CLI-shareable, so `packages/core` is the right target. If the team prefers not to stand up `packages/core` for one small module, `packages/db`'s non-DB utility surface is the fallback — but `packages/core` keeps DB-free code DB-free.

### App orchestration — `apps/web/lib`

| Symbol | Location | Disposition |
|---|---|---|
| `isGodEmail(email)` | `access-control.ts` | **REUSE** (reads `process.env.GOD_EMAILS` → stays in app) |
| `isEnvCode(code)` | `access-control.ts` | **EXTEND** (thin wrapper reading `process.env.INVITE_CODES`, delegating to `isEnvCodeMatch` in core) |
| `claimInviteCode(code)` | `access-control.ts` | **REUSE** (server-only; env precedence + atomic consume + test-store switch) |
| `redeemInviteForUser(authUser, rawCode)` | `users.ts` | **REUSE** (orchestrator; touches DB backends + test backend) |
| `hasCampAccess(campUser, primaryEmail)` | `users.ts` | **REUSE** |

### Server actions + route handlers — `apps/web/app`

| Symbol | Location | Disposition |
|---|---|---|
| `createInviteAction(_prev, formData)` | `tools/invite/actions.ts` | **EXTEND** (re-point `generateInviteCode`/`isSyntacticallyValidCode` imports to `packages/core`; optionally adopt 7-day expiry if product confirms; logic otherwise unchanged) |
| `generateUnusedCode()` | `tools/invite/actions.ts` (private) | **REUSE** (stays in app — it interleaves the pure generator with a DB existence check, so it is inherently DB-coupled) |
| `submitInviteCode(_prev, formData)` | `signup/required/actions.ts` | **REUSE** (`redirect`, rate-limit, auth — all Next-coupled) |
| `GET` check route | `api/tools/invite/check/route.ts` | **EXTEND** (import hint from core; reconcile prod/test existence semantics — OQ #4) |

### Transport / UI types

| Symbol | Location | Disposition |
|---|---|---|
| Check response `{available, reason, hint}` | inline in check route (or `packages/types` `InviteCheckResult` if shared) | **REUSE**/optional NEW (keep inline unless drift) |
| Client `availability` union | `invite-form.tsx` | **NEW** (presentation — surface plan owns it) |

---

## Hybrid extraction — what MOVES to packages vs what STAYS in app

Per the LOCKED hybrid decision: extract framework-agnostic business logic + validation to packages; leave Next-coupled / server-only / auth-session / route-handler bits in `apps/web`.

### MOVE → `packages/core` (pure, framework-agnostic, no `next/*`, no `server-only`, no `process.env`)

| What | From | To | Justification |
|---|---|---|---|
| `generateInviteCode`, `isSyntacticallyValidCode`, `CODE_RULES_HINT`, + extracted `CODE_PATTERN`/length constants | `apps/web/lib/invite-words.ts` | `packages/core` | The entire `invite-words.ts` module is already pure (zero imports). It's the canonical example of framework-agnostic logic: slug generation + syntax validation are reusable by the web app, a future CLI (which already mints codes), and tests. Moving it makes the single-source hint constant (OQ #3) trivially shareable. |
| `isEnvCodeMatch(code, allowedCsv) → boolean` | new (the pure half of `isEnvCode`) | `packages/core` | The string-membership test is pure; only the `process.env.INVITE_CODES` **read** is environment-coupled. Split: pure matcher in core, env read in app. |

### STAY in `apps/web` (Next-coupled / server-only / auth-session / route handlers / env reads)

| What | Where | Why it must stay |
|---|---|---|
| `createInviteAction`, `submitInviteCode` | `app/.../actions.ts` | `"use server"` actions; consume `FormData`, call `getAuthenticatedUser`/`getAuthenticatedUserOrRedirect` (session), `redirect` (`next/navigation`), rate-limit, and DB writes. Inherently Next-coupled. |
| `GET` check route | `app/api/tools/invite/check/route.ts` | Route handler; `NextResponse`, `Request`, auth, rate-limit. |
| `generateUnusedCode` | `tools/invite/actions.ts` | Pure generator interleaved with `findInviteCodeByCode` (DB I/O) — it's a retry-against-the-DB loop, not pure. Keep in app; it composes the core generator with data access. |
| `claimInviteCode`, `isEnvCode`, `isGodEmail`, `consumeDbCode` | `access-control.ts` | `import "server-only"`; read `process.env`; switch on `isE2ETestMode()` + `testStore`. Server-only orchestration. (The pure membership logic is extracted to `isEnvCodeMatch`; the env read + server-only guard stay.) |
| `redeemInviteForUser`, `hasCampAccess` | `users.ts` | Orchestrate DB backends + test backend + `seedBurnerProfileAction` + god-email check; server-only app glue. |
| Rate-limit calls | both actions/route | App infra (in-memory token bucket, `apps/web/lib/rate-limit.ts`). |

**Net:** one small pure module (`invite-words` + the env-match helper) moves to `packages/core`; everything that touches sessions, env, the DB, or Next request/response stays in `apps/web`. The data-access functions already live correctly in `packages/db`.

---

## Build steps — ordered, with acceptance criteria + test approach

> All steps are plan-doc-only here; this section describes what the implementing pass will do. Existing tests to respect: `apps/web/tests/e2e/invite-tracking.spec.ts`, `apps/web/lib/test-store.ts` (invite methods).

1. **Stand up / confirm `packages/core` and move `invite-words.ts`.**
   - Move `generateInviteCode`, `isSyntacticallyValidCode`, `CODE_RULES_HINT` to `packages/core`; extract `CODE_PATTERN`, `INVITE_CODE_MIN=3`, `INVITE_CODE_MAX=48` as named exports. Add a `packages/core` export entry (mirror the `./invite-codes` export pattern in `packages/db/package.json`).
   - Re-point importers: `tools/invite/actions.ts`, `api/tools/invite/check/route.ts`. Leave a thin `apps/web/lib/invite-words.ts` re-export only if needed to minimize churn (prefer direct imports).
   - **Acceptance:** type-check + existing build pass; no behaviour change.
   - **Test:** **NEW unit tests** for the pure module (first tests it's ever had): `generateInviteCode` matches `CODE_PATTERN` and length bounds; `isSyntacticallyValidCode` truth table (too short, too long, leading/trailing hyphen, spaces, uppercase, valid slug); `CODE_RULES_HINT` is the single exported string. Co-locate as `packages/core` unit tests.

2. **Single-source the hint string (OQ #3).**
   - Replace the client effect's hardcoded "3–48 chars, lowercase letters / digits / hyphens." with the imported `CODE_RULES_HINT`. Replace the server error string in `createInviteAction` ("Invite code must be 3–48 chars, lowercase letters/digits/hyphens.") to derive from the same constant where it reads naturally.
   - **Acceptance:** grep shows exactly one literal definition of the rule text; client hint and API hint render identical strings.
   - **Test:** assert in the core unit test that the constant exists; a presentation test (surface layer) verifies the rendered hint equals `CODE_RULES_HINT`.

3. **Extract `isEnvCodeMatch` (pure) and re-wire `isEnvCode`.**
   - Add `isEnvCodeMatch(code, allowed: string[])` to `packages/core`. `apps/web/lib/access-control.ts`'s `isEnvCode` becomes: read `process.env.INVITE_CODES` via the existing `csv()` helper, delegate to `isEnvCodeMatch`.
   - **Acceptance:** `claimInviteCode` env-precedence behaviour unchanged; E2E env-code spec still green.
   - **Test:** **NEW unit test** for `isEnvCodeMatch` (membership, trimming handled by caller); existing `invite-tracking.spec.ts` env-code case stays green.

4. **Reconcile check-route prod/test existence semantics (OQ #4).**
   - Decide the rule (recommend: a code name is reserved by its PK forever, so availability uses `findInviteCodeByCode` semantics in both prod and E2E). Add a `findInviteCodeByCode`-equivalent to `apps/web/lib/test-store.ts` (currently only `findUsableInviteCode`) and switch the check route to it under E2E.
   - **Acceptance:** a seeded revoked/expired/exhausted code reads "taken" in **both** prod and E2E; documented divergence in S14 §"Validation & edge cases" is resolved.
   - **Test:** **NEW E2E** (or extend `invite-tracking.spec.ts`): seed a maxed-out code, hit `/api/tools/invite/check?code=<it>`, assert `{available:false, reason:"taken"}`. Add a unit test on the test-store method.

5. **(Optional, gated on product) 7-day expiry on mint.**
   - Only if product confirms (db-impact `invite_codes.expires_at`, S24 copy). Set `expiresAt: new Date(Date.now() + 7*864e5)` in the `createInviteCode` call inside `createInviteAction`. `consumeInviteCode`/`findUsableInviteCode` already enforce expiry, so redemption needs no change.
   - **Acceptance:** minted codes carry `expires_at ≈ now+7d`; an expired code fails `consumeInviteCode` (already covered by the predicate).
   - **Test:** unit/E2E asserting a minted code's `expiresAt`; redemption-after-expiry already exercised by `consumeInviteCode` predicate logic.

6. **Backfill the missing service-layer tests (test-debt closeout).**
   - There are currently **no** unit tests for `createInviteAction`, `redeemInviteForUser`, or `claimInviteCode`. Add targeted tests (mock `getAuthenticatedUser`, DB module, test backend) covering: member invariants (`requiresApproval=true`, `maxUses=1`, email required, crafted `preApprove`/`maxUses` POST ignored — S14 §"Validation & edge cases"); captain knobs (`requiresApproval = !preApprove`, `maxUses ∈ [1,100]`, email required only single-use); uniqueness pre-check + race fallback ("Couldn't save invite."); redemption idempotency (god / already-has-code), env-precedence, atomic race-loser → "isn't valid", `requiresApproval` → pending.
   - **Acceptance:** the invariants in S14/S03 §"Validation & edge cases" are each pinned by a test; coverage closes the gap noted in "Current state".
   - **Test:** place app-orchestration tests under `apps/web/lib/__tests__/` (matches existing pattern, e.g. `member-detail.test.ts`, `auth.test.ts`); action tests near the actions or in `__tests__`.

> Presentation-only items intentionally **out of scope for this service plan** but flagged for the surface pass: card-treatment consistency (OQ #1), the onboarding-gate question on `/tools/invite` (OQ #2 — should an approved-but-onboarding-incomplete user mint?), `max-w-xl` vs `max-w-lg` (OQ #5), `success`/accent-tint tokens (OQ #6), stale Tools-hub + S03 placeholder copy (OQ #7 / S03 divergence #3), and the rejected-user-re-redemption / `invited_email`-not-validated product questions (S03 OQ #2, #5). None require service-layer code.

---

## Cross-domain dependencies

- **Users / camp-access (`apps/web/lib/users.ts`, `apps/web/lib/access-control.ts`):** redemption writes `users.invite_code`, `users.rank`, `users.approval_status` and creates the row on first redemption (`createUser`). `hasCampAccess` (this domain's gate predicate) is consumed app-wide. Tightest coupling.
- **Approval / vetting (roster domain):** `requires_approval` codes set `approval_status = "pending"`, feeding the captain approval queue (S17). `assigned_rank` (always NULL from this surface) would stamp rank — only CLI codes do that. The new `captain_promotion_requests` table (the redesign's sole schema change) is the **roster** domain's, not this one — but note that rank-promotion is now a double-opt-in handshake, reinforcing that `/tools/invite` must keep `assigned_rank = NULL` (no rank promotion via invite codes in-app).
- **Required actions / onboarding (`apps/web/lib/required-actions.ts`, `apps/web/lib/questionnaire.ts`):** first-time redemption calls `seedBurnerProfileAction` → `ensureRequiredAction` (no-op under E2E). Redemption is the trigger that seeds the onboarding obligation.
- **Family tree / lineage:** reads `invite_codes.created_by_user_id` joined to redeemers' `users.invite_code` to render who-brought-whom. Read-only consumer; the join lives in the roster/lineage domain.
- **Rate-limit infra (`apps/web/lib/rate-limit.ts`):** in-memory token bucket; both the redeem action (`invite-redeem:<id>`, 10/10min) and the check route (`invite-check:<id>`, 30/60s) depend on it. Shared infra, not invite-specific; flagged for Upstash if multi-region (S03 OQ #3).
- **Auth / session (`apps/web/lib/auth.ts`, Neon Auth):** every action/route here re-asserts auth. Stays in app per the hybrid rule.
- **Test harness (`apps/web/lib/test-store.ts`, `api/test/seed-invite`, E2E):** the test store mirrors `invite-codes.ts`; the prod/test parity reconciliation (step 4) and the `expiresAt` boundary asymmetry are maintenance items here.
