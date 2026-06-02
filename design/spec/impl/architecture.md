# Impl plan — target package architecture (the authoritative root)

> The root of the implementation-planning pass. The 9 domain service-layer plans
> (`service-layer/01`–`09`) and the foundations plan (`foundations-tokens.md`) all
> assume the package shape, layering, and the one schema change defined here. The
> per-component (`components/`) and per-app (`app/`) plans that follow inherit it.
>
> **This is a REDESIGN on a working, shipped app — not greenfield.** Every item is
> classified REUSE (exists, keep) / EXTEND (modify) / NEW (build) / DELETE (dead).
> The locked plan decisions (CLAUDE.md + `_analysis/decisions.md`) govern: hybrid
> service layer; plan-docs only (no code in this pass); `design/spec/` wins over
> `design/feature-set/` (reference-only).
>
> **Headline:** the redesign is package-shape-stable. The existing six runtime
> packages stay. One NEW package is created — **`@camp404/core`** (pure,
> framework-agnostic business logic + validation) — justified by **7 of the 9
> domain plans** independently asking for it and by a real non-web consumer
> (`apps/admin-cli`). The entire schema delta is **one additive table + one enum**
> (`captain_promotion_requests` / `promotion_request_status`). Everything else is
> app-layer/presentation, and most of the service layer is REUSE.

---

## Package map — final responsibility of each package

Verified against the live tree (`packages/*/package.json`, `apps/*`): runtime
packages today are `@camp404/types`, `@camp404/db`, `@camp404/ui`,
`@camp404/ai-prompts`, `@camp404/telegram` (+ the `eslint-config` /
`typescript-config` dev packages). Apps: `web`, `admin-cli`, `mobile`.

### `@camp404/types` — shared Zod schemas + inferred TS types · REUSE + small EXTEND

The contract layer. Pure type/Zod definitions, **no logic, no I/O, no `next/*`**.
Depends on nothing (leaf). Today exports `roles`, `announcement`, `member`,
`questionnaire` (incl. the validation *engine* `validateResponses`/`validateOne`/
`diffResponses`/`displayResponseValue`/`flattenQuestions`), `recipe`,
`reimbursement`, `voice-intent`.

Final responsibility: the single source of truth for every shape that crosses a
boundary (request/response, DB-row view-models, domain enums). The questionnaire
**validation engine stays here** (it is the canonical Zod-driven shape validator,
already correctly placed — domain plan 03).

Redesign additions (all small, all NEW Zod modules — domain plans 01/05/06):
- `roles.ts` EXTEND: add `StoredRank = z.enum(["captain","member"])` (the *stored*
  enum) and `ApprovalStatus = z.enum(["pending","approved","rejected"])`,
  centralising the inline string-unions repeated across `users.ts`/`test-store.ts`/
  `roster.ts`. Keep the existing 3-member `Rank` (incl. derived `team_lead`) and add
  `ViewerRank` (`camp_member｜team_lead｜captain`) as the clearance ladder.
- `promotion.ts` NEW: `PromotionRequestStatus` enum + `IncomingPromotionRequest`
  (the acceptance-surface view shape) — backs the one schema change (plan 05).
- `referral.ts` NEW: `ReferralUser` (Zod) + `TreeNode` (interface) — replaces the
  hand-copied `TreeUser` and the local `relations.ts` interface (plan 06).
- `QuestionnaireQueueItem` NEW (plan 03, surface 27): the queue read's return shape.
- Optional/deferred: `mcp.ts` (lift inline `AuthorizeQuery` + scope consts —
  plan 08, only if a second consumer materialises); `RateLimiter` interface +
  feedback/shake/id-validation contract types travel here **if** their logic is
  extracted to `core` (plan 09).

### `@camp404/db` — Drizzle schema + per-domain DATA-ACCESS · REUSE + the one EXTEND

Owns the schema and **all SQL**. Per-domain data-access modules (verified exports):
`schema`, `burner-profile`, `questionnaire-edits`, `invite-codes`, `relations`,
`roster`, `broadcasts`, `audience`, `push`, `push-status`, `account`, `activations`,
`versions`, `mcp`, `telegram`, `crypto`, `id-documents`, `maintenance`. Depends only
on `@camp404/types` + `drizzle-orm` + the Neon driver.

Final responsibility: schema definition, migrations, and every query/mutation. Per
the hybrid decision **`packages/db` keeps schema + data-access** — it does NOT become
a logic package. Three classes of code live here and STAY here even though some is
pure, because it is schema-bound infrastructure (plans 03/05/09):
- `crypto.ts` (`encrypt`/`decrypt`/`decryptOrNull`) — `node:crypto`, tied to
  `PGCRYPTO_KEY` + the encrypted `users` columns it serves.
- `id-documents.ts` (`splitIdNumber`/`mergeIdNumber`/`idColumnsFor`) — pure mapping,
  but it maps directly onto schema columns and is the documented PII split boundary.
- `maintenance.ts` (`backfillIdEncryption`) — Drizzle-coupled.

Redesign delta:
- The **one schema change**: `captainPromotionRequests` table +
  `promotionRequestStatusEnum` (see §"The one schema change"). NEW.
- `captain-promotion.ts` NEW data-access module (handshake queries). Add
  `"./captain-promotion"` to `package.json` exports (mirrors `./roster`, `./crypto`).
- `roster.ts` EXTEND: add `handle` (from `telegramHandle`) to `getCampManagementRoster`
  SELECT + `CampManagementMember`.
- `burner-profile.ts` EXTEND: `upsertBurnerProfile` COALESCE `completedAt` fix
  (data-integrity, no DDL — plan 03).
- `activations.ts` EXTEND: NEW `listQuestionnaireQueue(userId)` read (surface 27).
- `relations.ts`: DELETE the two dead exports `getInvitesIssuedBy` / `getRootCodes`
  (zero consumers — plan 06); re-type `getReferralRoster` to import `ReferralUser`.
- The already-pure modules `audience.ts` / `push-status.ts` / `push.ts:planPushDrain`
  are eligible to relocate to `core` but **stay in db** unless the cross-domain
  consistency call is to move all pure cores (see §Open decisions). They satisfy the
  hybrid rule where they are.

### `@camp404/ui` — shared React component library · REUSE + heavy EXTEND/NEW (components plan)

Radix + CVA component primitives, exported with `globals.css` as
`@camp404/ui/styles.css`. Depends on `@camp404/types` (+ optionally `@camp404/core`
once it exists, for pure UI helpers like `rankLevel`/`initialsFrom`).

Final responsibility: every reusable presentational primitive (atoms → molecules →
organisms), the `@theme` token set + font wiring (foundations plan), and the shared
clearance/preview-but-locked organism (`CaptainLock`). It holds **presentation
only** — no data-access, no `next/*` server code.

Redesign delta (detailed in the foundations + components plans; summarised here):
- **Foundations (ships first):** NEW status tokens (`success`/`warning`/`info`),
  `--overlay` scrim, radius scale, `--font-*` + `--text-*` steps in
  `globals.css`; `next/font` wiring in the app. Gates everything downstream.
- **PROMOTE** the hand-rolled primitives into `@camp404/ui`: `Badge`,
  `SegmentedControl`, `IconBadge`, `Alert`, `NavCard`, `CaptainLock`, `Avatar`,
  `RankPill`, `ProgressBar`, `EmptyState`, `Stepper`, `CodeField`, `Spinner`,
  `InputField`, `OptionCardGroup`, etc. (component-library `mapsTo`).
- **NEW:** `Switch`, `Toast` + emitter (the headline NEW reusable — plans 04/09).

### `@camp404/core` — NEW · pure, framework-agnostic business logic + validation

The one new package. Pure functions and constants: **no `next/*`, no `server-only`,
no React, no DB, no `process.env`, no I/O.** Depends only on `@camp404/types` (and
`node:crypto`/DOM globals where a function is platform-pure but framework-agnostic).
Consumable by `apps/web`, `apps/admin-cli`, `apps/mobile`, `packages/ui`, and tests.

**Decision: YES, create `packages/core`.** Justification:
1. **7 of 9 domain plans independently specify it** as the extraction target
   (identity-access 01, invites 02, questionnaire 03, roster 05, family-tree 06,
   mcp 08, platform 09). Broadcasts (04) and voice (07) say "only if core exists
   for others" — it does, so their pure cores can follow for consistency.
2. **A real non-web consumer exists today:** `apps/admin-cli` (depends on `db`+`types`,
   has its own `vitest`) already mints invite codes — exactly the slug-generation /
   validation logic plan 02 extracts. `core` lets the CLI and web share one tested
   implementation instead of duplicating.
3. The hybrid rule says extract *logic + validation* to packages and keep `types` as
   the type layer; mixing data constants and business logic into `types` muddies its
   role. `core` is the locked home ("a new packages/core, or into packages/db/types
   where it fits") — and it fits cleanly.

What goes in `core` (the consolidated extraction list — see §Hybrid extraction):
- **Access/clearance (plan 01):** `hasCampAccess`, `isApproved` (pure, take an
  `isGod` boolean), `nextGate` (parameterised route map), `rankLevel`/`RANK_ORDER`,
  `deriveViewerRank`, NEW `requireClearance` (the preview-but-locked decision).
- **Invites (plan 02):** `generateInviteCode`, `isSyntacticallyValidCode`,
  `CODE_RULES_HINT` + `CODE_PATTERN`/length consts (single-source the hint),
  `isEnvCodeMatch`.
- **Questionnaire (plan 03):** the `QUESTIONNAIRE` v8 catalogue + `TEAMS`/
  `DIETARY_INGREDIENTS`/`COUNTRY_OPTIONS`/`countries`, and `validateIdNumber`.
  (The Zod validation *engine* stays in `types`.)
- **Promotion (plan 05):** `canSendPromotion`, `canDecidePromotion`,
  `nextPromotionStatus`, `promotionStepState` (the pure state machine + guards).
- **Family tree (plan 06):** `buildTree` (+ cycle guard), `computeMatchIds` (+ cycle
  guard — the MUST-FIX), `subtreeHasMatch`, `countDescendants`, `descendantCountLabel`.
- **MCP (plan 08):** `mcpAccessError`, `resolveMcpScope`, `canSeeIdDocuments`, the
  token crypto (`sha256`/`generateOpaqueToken`/`constantTimeEqual`/`verifyPkce`),
  `DEFAULT_SCOPE`/`isAllowedScope`/`isAllowedRedirectUri`, NEW `buildConsentModel`/
  `buildGateModel`.
- **Platform (plan 09):** `redactPii`/`sanitizeReportText`/`labelsFor`/
  `buildFeedbackIssue`, `initialsFrom`, `cropResizeToSquare` (browser-pure),
  `createShakeDetector`, `rateLimit` token-bucket behind a `RateLimiter` interface,
  `isAuthorizedCron`.
- **Optionally:** `computeAudience`, `push-status.ts`, `planPushDrain` (plan 04) —
  relocate-or-leave decision (§Open decisions).

`core` should mirror `@camp404/types`'s minimal setup (tsconfig, vitest, eslint-config)
and depend only on `@camp404/types`. It must never import `@camp404/db` or `next/*`.

### `@camp404/ai-prompts` — versioned LLM prompt templates · REUSE (untouched)

Owns Claude/Anthropic prompt templates + `PROMPT_VERSIONS` (e.g. `voiceIntentPrompt`).
Wired into the web app's transpile list; **no feature imports it yet** (plan 07). The
redesign does not touch it. Note (plan 07): the Whisper bias string
`QUESTIONNAIRE_PROMPT` is a *different concept* (a transcription hint, not a model
prompt) and stays in `apps/web/lib` — do not fold it here.

### `@camp404/telegram` — Telegram fan-out mirror · REUSE (untouched)

Depends on `@camp404/db`. Owns `dispatchPendingAnnouncements` — a parallel fan-out of
the same `broadcasts` rows to Telegram channels, driven by `/api/cron/telegram/dispatch`.
The redesign does not change it, but it is a **second consumer of the `broadcasts`
table** (plan 04 cross-domain) — any change to broadcast publish semantics must account
for it. No surface, out of scope this pass.

### `apps/web` — Next App Router app · the Next-coupled tier (REUSE + EXTEND)

Holds everything framework-coupled. The cut line: **does it import `next/*`,
`server-only`, React, auth/session, or perform I/O / read env?** If yes, it stays here.
- `apps/web/lib/*` — app ORCHESTRATION: `auth`/`neon-auth` (session), `access-control`
  (`isGodEmail`/env reads), `users` (session→row resolution, DB-backend/test-backend
  split, mutations), `required-actions` (`ACTION_ROUTES` registry + `nextGate` wrapper),
  `notifications`/`push`/`firebase-admin`, `forms` (replay registry), `member-detail`/
  `camp-roster` (pure view-models that stay app-resident — see Hybrid), `feedback-ai`,
  `rate-limit` (`getClientIp` edge helper), `cron-auth` (`assertCron`), `test-mode`/
  `test-store`, `og-image`, `groq`/`voice-prompts`, `mcp/*` (DB-bound + route HTML),
  NEW `promotion.ts` facade, NEW `avatar-blob.ts`.
- `apps/web/app/*` — routes, server actions (`"use server"`), route handlers
  (`/api/**`), client components (`"use client"`), error/not-found boundaries.

After the redesign, the app-layer pure-logic modules become **thin shims** that import
from `core` and keep their call-sites stable (e.g. `hasCampAccess(user, email)` calls
`core.hasCampAccess(user, isGodEmail(email))`).

### `apps/admin-cli` & `apps/mobile` — secondary consumers

`admin-cli` (db+types, vitest) is the concrete second consumer that justifies `core`'s
existence (shared invite-code minting/validation). `mobile` is a future native target;
field-level voice has a `TODO(capacitor)` native path (plan 07, deferred). Neither is
in scope for build this pass, but both are reasons the extracted logic must be
framework-agnostic.

---

## Dependency layering — allowed import direction (no cycles)

The single allowed direction is **leaf-to-app, never backward**:

```text
                       ┌─────────────────────────────────────────────┐
                       │                  apps/*                      │
                       │   apps/web (Next)   apps/admin-cli   apps/mobile │
                       └──────────────┬──────────────────────────────┘
            ┌─────────────────────────┼───────────────────────┐
            │                         │                        │
            ▼                         ▼                        ▼
     ┌────────────┐           ┌──────────────┐         ┌──────────────┐
     │ @camp404/  │           │  @camp404/   │         │  @camp404/   │
     │    ui      │           │  ai-prompts  │         │  telegram    │
     └─────┬──────┘           └──────┬───────┘         └──────┬───────┘
           │                         │                        │
           ▼                         ▼                        ▼
     ┌────────────┐                  │                ┌──────────────┐
     │ @camp404/  │                  │                │  @camp404/db │
     │   core     │  ◄───────────────┘ (none today)   └──────┬───────┘
     │  (NEW)     │                                          │
     └─────┬──────┘                                          │
           │                                                 │
           └──────────────────────┬──────────────────────────┘
                                   ▼
                          ┌──────────────┐
                          │  @camp404/   │
                          │    types     │   (leaf — depends on nothing)
                          └──────────────┘
```

Canonical chain for the new package: **`types ← core ← ui ← app`**, with `db`
sitting beside `core` (both depend only on `types`; neither imports the other):

```text
types  ←  db          (db depends on types; data-access)
types  ←  core         (core depends on types ONLY; pure logic — NEVER imports db)
types, core  ←  ui     (ui may use core for pure helpers; presentation)
all of the above  ←  apps/web / admin-cli / mobile / telegram
```

Hard rules (enforce by lint/import-graph review):
- **`@camp404/types` imports nothing** internal (leaf).
- **`@camp404/core` imports ONLY `@camp404/types`** — never `@camp404/db`, never
  `next/*`, never `server-only`, never React. This is the property that makes it
  testable without a DB or a route harness and reusable by the CLI/mobile.
- **`@camp404/db` imports ONLY `@camp404/types`** (+ Drizzle/driver). It must NOT
  import `@camp404/core` — the data layer stays logic-free. (If a query ever needs a
  pure helper, the orchestration in `apps/web` composes them, not `db`.)
- **`@camp404/ui` may import `@camp404/types` and `@camp404/core`** (pure helpers like
  `rankLevel`, `initialsFrom`), never `@camp404/db` or `next/*` server code.
- **`@camp404/telegram` / `@camp404/ai-prompts`** sit at the app tier's level for
  imports: `telegram` → `db`+`types`; `ai-prompts` → leaf. Apps depend on all of them.
- **Only `apps/*` import `next/*`, `server-only`, auth/session, route handlers.**

**No cycles.** The one risk vector is `core ↔ db`: it is forbidden in both directions.
`db` already depends on `types` only; `core` is added depending on `types` only;
the existing `types ← db` edge is untouched. `core` is therefore a sibling of `db`,
not above or below it — no cycle is possible.

---

## The one schema change — `captain_promotion_requests` + enum

The entire schema delta in the whole redesign (db-impact.json change #6, decision #4,
plan 05). Forward, additive, **non-breaking, no DB nuke**.

**New enum** (`schema.ts`, after `approvalStatusEnum`):
```ts
export const promotionRequestStatusEnum = pgEnum("promotion_request_status", [
  "sent", "accepted", "declined", "cancelled",
]);
```

**New table** (near the user-scoped tables / `teamMemberships`):
```ts
export const captainPromotionRequests = pgTable(
  "captain_promotion_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetUserId: uuid("target_user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: promotionRequestStatusEnum("status").notNull().default("sent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { mode: "date" }),
  },
  (t) => ({
    // At most one OPEN ('sent') request per target — the DB-level guarantee
    // behind the app's idempotent-send rule.
    openPerTarget: uniqueIndex("captain_promotion_open_per_target_idx")
      .on(t.targetUserId).where(sql`${t.status} = 'sent'`),
    targetIdx: index("captain_promotion_target_idx").on(t.targetUserId),
  }),
);
```

Why a table at all: `setUserRank` is a one-sided direct write and **cannot model the
two-sided handshake** (captain sends → target accepts in their own app before rank
flips). The `sent` row is durable pending state; rank flips to `captain` ONLY on the
target's `accepted` transition, via an **explicit `setUserRank` call in the accept
action** — the DB module has no cross-table side effects.

**Migration placement:** this repo uses drizzle-kit with `out: ./migrations`
(verified: numbered `0000`…`0011`). This is migration **`0012`**:
1. Edit `packages/db/src/schema.ts` (enum + table above).
2. `pnpm --filter @camp404/db db:generate` → emits `0012_<name>.sql` (CREATE TYPE,
   CREATE TABLE, FKs, the partial unique index).
3. **Review the generated SQL** — confirm the partial-index `WHERE status = 'sent'`
   survived generation (drizzle-kit partial indexes sometimes need a hand-edit of the
   `.sql` + `meta/` snapshot).
4. `pnpm --filter @camp404/db db:migrate` — runs forward; god accounts / lineage /
   audit history preserved.
5. Add `"./captain-promotion": "./src/captain-promotion.ts"` to `db/package.json`.

FK note: `onDelete: cascade` on both FKs (matches `team_memberships`). If audit
retention of a deleted requester is wanted, switch `requestedByUserId` to `set null`
+ nullable (matches `approvalDecidedByUserId`) — confirm with the data owner; default
to `cascade`.

This migration is the **gate for the roster's two-sided assign-captain flow** (build
Phase 5). No other migration exists in the redesign.

---

## Hybrid extraction summary — apps/web/lib modules to extract to packages

The consolidated extraction list from all 9 domain plans. Locked rule: pure
logic/validation → `packages/core`; schema-bound infra → `packages/db`; anything
`next/*` / `server-only` / session / route / env stays in `apps/web`.

| From (today) | Symbol(s) | → target | Plan | Risk |
|---|---|---|---|---|
| `apps/web/lib/users.ts` | `hasCampAccess`, `isApproved` (bodies) | `core` (app keeps thin shims passing `isGodEmail(email)`) | 01 | Low — call-sites unchanged; pure boolean logic. |
| `apps/web/lib/required-actions.ts` | `nextGate` traversal (route map parameterised) | `core` (app keeps `ACTION_ROUTES` + wrapper) | 01 | Low — already import-free; registry stays app-side. |
| `packages/ui/control-panel.tsx` | `rankLevel`, `RANK_ORDER` | `core` (UI re-imports) | 01 | Low — shared comparator; server + UI stop drifting. |
| `apps/web/app/page.tsx` | `viewerRank` ternary → `deriveViewerRank` | `core` | 01 | Low — pure mapping. |
| (new) | `requireClearance` | `core` | 01 | Low (NEW) — heart of preview-but-locked (D3). |
| `apps/web/lib/invite-words.ts` | `generateInviteCode`, `isSyntacticallyValidCode`, `CODE_RULES_HINT` + `CODE_PATTERN`/len consts | `core` | 02 | Low — whole file already pure (zero imports); also unblocks admin-cli reuse. |
| `apps/web/lib/access-control.ts` | `isEnvCodeMatch` (pure half of `isEnvCode`) | `core` (env read stays in app) | 02 | Low — split pure matcher from env read. |
| `apps/web/lib/questionnaire.ts` | `QUESTIONNAIRE` v8 catalogue + `TEAMS`/`DIETARY_INGREDIENTS`/`COUNTRY_OPTIONS` | `core` | 03 | Medium — ~6 import sites move (`@/lib` → `@camp404/core`); largest churn. |
| `apps/web/lib/countries.ts` | `COUNTRIES`/`countryFlag` (carried with catalogue) | `core` | 03 | Low — pure data. |
| `apps/web/lib/id-validation.ts` | `validateIdNumber` (SA-ID/passport) | `core` | 03/09 | Low — zero imports; enables shared server+client check. |
| (new) `packages/core/promotion.ts` | `canSendPromotion`, `canDecidePromotion`, `nextPromotionStatus`, `promotionStepState` | `core` | 05 | Low (NEW) — pure guards/state machine; highest-value test surface. |
| `apps/web/app/family-tree/family-tree.tsx` | `buildTree`, `computeMatchIds`, `subtreeHasMatch`, `countDescendants` (+ NEW `descendantCountLabel`) | `core` | 06 | Medium — carries the MUST-FIX cycle guards; first `core` consumer in plan 06. |
| `apps/web/lib/mcp/{access,scope,consent,tokens,oauth}.ts` | `mcpAccessError`, `resolveMcpScope`, `canSeeIdDocuments`, token crypto, `DEFAULT_SCOPE`/`isAllowedScope`/`isAllowedRedirectUri` (+ NEW `buildConsentModel`/`buildGateModel`) | `core/mcp/*` | 08 | Medium — must keep unit-29 tool routes' imports green; existing tests move with code. |
| `apps/web/lib/github-feedback.ts` | `redactPii`, `sanitizeReportText`, `labelsFor`, `buildFeedbackIssue` + guards | `core/feedback` | 09 | Low — whole file already I/O-free + unit-tested. |
| `apps/web/lib/initials.ts` | `initialsFrom` | `core/text` | 09 | Low — zero-dep. |
| `apps/web/lib/image.ts` | `cropResizeToSquare` | `core/media` (browser-pure export) | 09 | Low — DOM-only but framework-agnostic. |
| `apps/web/lib/rate-limit.ts` | `rateLimit` + token-bucket behind NEW `RateLimiter` interface | `core/rate-limit` (`getClientIp` stays app edge) | 09 | Low — file already plans the Upstash swap "with the same signature". |
| `apps/web/components/feedback/use-shake-gesture.ts` | `createShakeDetector` (pure state machine) | `core/shake` (hook + permission helpers stay) | 09 | Low — already unit-tested without DOM. |
| `apps/web/lib/cron-auth.ts` | `isAuthorizedCron` | `core/auth-utils` (`assertCron` stays — returns `NextResponse`) | 09 | Low — `node:crypto` only. |

**Relocate-or-leave (consistency call, not correctness — §Open decisions):**
`packages/db/audience.ts` (`computeAudience`), `push-status.ts`, `push.ts:planPushDrain`
(plan 04) are already pure and satisfy the hybrid rule in `db`. Move to `core` ONLY if
the cross-domain decision is to home all pure cores there; otherwise leave (a
single-domain move is import-path churn for marginal gain).

**Stay pure-but-in-app (deliberately NOT extracted):** `lib/camp-roster.ts`
(`toRosterRow`/`rankLabel` + NEW `deriveRosterStats`/`matchesRosterQuery`/`matchesChip`)
and `lib/member-detail.ts` (`presentMemberDetail`) are pure view-models, already
tested under jsdom, but import app-local catalogues; they are presentation mapping, not
business invariants — leave in `apps/web/lib` (plans 05/06). `assertServerEnv` (plan 09)
and `QUESTIONNAIRE_PROMPT` (plan 07) also stay — app-policy / single-consumer.

**Stay in `apps/web` (Next-coupled, never move):** all `auth`/`neon-auth`,
`access-control` env reads, `users`/`notifications`/`push`/`promotion` facades
(`server-only` + DB/test-backend split + session), all `"use server"` actions, all
`/api/**` route handlers, all `"use client"` components, `firebase-admin`/`groq`/
`anthropic` SDK adapters, `og-image`, `test-mode`/`test-store`, `assertCron`.

---

## Service-layer build order — phased, dependency-ordered

Each phase lists what it unblocks. Phases gate the next; `‖` marks parallelizable items.
This nests inside the spec README's surface build sequence — the surface phases (Home,
tools, captain surfaces…) consume the service APIs landed here.

**Phase 0 — Foundations: tokens + fonts** (`foundations-tokens.md`).
Status tokens (`success`/`warning`/`info`), `--overlay`, radius + `--text-*` scale,
`next/font` wiring; the token-spelling / radius / status-file codemods. **No package
graph change.** *Unblocks:* every component and surface (Badge/Alert/Toast need status
tokens; mono motif needs the font tokens). Hard prerequisite for the whole redesign.

**Phase 1 — Scaffold `@camp404/core` + types deltas.**
Stand up `packages/core` (tsconfig/vitest/eslint mirroring `@camp404/types`, depends on
`types` only, export entry pattern mirroring `db`). Add the `packages/types` additions
(`StoredRank`/`ApprovalStatus`/`ViewerRank` in `roles`, `promotion.ts`, `referral.ts`,
`QuestionnaireQueueItem`). *Unblocks:* every extraction (Phases 2–3) and the promotion
data-access. Land core empty-but-building first, then move logic into it.
*Acceptance:* `core` builds + resolves from `apps/web`, `apps/admin-cli`, `packages/db`
is NOT a dependency; `types` additions compile.

**Phase 2 — `db` deltas (schema + data-access).**
- 2a. **The migration** (`0012` captain-promotion enum+table) + `captain-promotion.ts`
  data-access + `db/package.json` export. *Unblocks:* roster assign-captain flow,
  acceptance surface.
- 2b. `db` EXTENDs: `roster.handle`, `upsertBurnerProfile` COALESCE,
  `listQuestionnaireQueue`; `relations` re-type + DELETE dead `getInvitesIssuedBy`/
  `getRootCodes`. *Unblocks:* roster `@handle`, surface-27 queue, family-tree typing.
  `‖` 2a and 2b are independent.

**Phase 3 — `core` extractions (pure logic moves, lowest-risk first).**
Order within: (a) access/clearance (`hasCampAccess`/`isApproved`/`nextGate`/`rankLevel`/
`deriveViewerRank`/`requireClearance` — plan 01) → it is the spine every authed surface
inherits; (b) `‖` invites (02), questionnaire catalogue + `validateIdNumber` (03),
family-tree (06 — with cycle guards), feedback/initials/image/rate-limit/shake/cron
(09), mcp pure helpers + view-models (08); (c) promotion guards/state-machine (05).
App-layer shims re-export from `core` so call-sites stay stable. Move each module's
tests *with* the code; add the net-new tests the plans call out (invite-words,
id-validation, initials, promotion matrix, cycle-guard regressions).
*Unblocks:* the service APIs in Phase 4 and the surface preview-but-locked grammar.

**Phase 4 — service APIs (new app-layer orchestration over the above).**
- Promotion: `lib/promotion.ts` facade (real/test split) + `sendCaptainPromotionAction`
  (roster side) + `accept`/`decline`/`cancel` actions (acceptance side, calls
  `setUserRank` only on accept) — plan 05.
- Preview-but-locked conversion (plan 01): `/captains/tools` + `/captains/announcements`
  from hard-redirect → `requireClearance` + shell + `CaptainLock` (data withheld);
  align `camp-management` + `requireCaptain` onto `requireClearance`.
- Roster derived stats/predicates (`deriveRosterStats`/`matchesRosterQuery`/`matchesChip`
  in `lib/camp-roster.ts`) + `getMemberDetailAction` promotion-step surfacing.
- Surface-27 queue wrapper `getQuestionnaireQueue`.
- Server hardening (plan 09): `avatar-blob.ts` orphan cleanup; `RateLimiter` interface
  at call-sites; error-boundary trace chip.
*Unblocks:* the captain surfaces, home rank-section acceptance, notifications, surface 27.

**Phase 5 — NEW reusables in `@camp404/ui`** (components plan; rides Phase 0 tokens).
`Toast` + emitter, `Switch`, and the PROMOTE set. `‖` with Phase 4 once token + shim
shapes are fixed. *Unblocks:* the presentation redesign of every surface, `popup`
delivery rendering.

> **Sequencing note (MEMORY: green-CI-is-done):** each extraction/move is an
> independently green-CI-clean change; do not strand post-green follow-ups. Phase 3's
> largest single churn (the questionnaire catalogue move, ~6 import sites) should land
> alone. The migration (2a) lands as its own change.

---

## Open architectural decisions — needing a human call

1. **Create `packages/core`? → ✅ CONFIRMED YES (user, 2026-06-02).** 7/9 plans
   ask for it + `admin-cli` is a real second consumer. (Rejected fallback: folding the
   pure logic into `packages/types`, which muddies the type layer.) Everything
   downstream assumes `core` exists — this is now locked, not a recommendation.
2. **Relocate the already-pure `db` cores to `core`?** `audience.ts`,`push-status.ts`,
   `push.ts:planPushDrain` (plan 04) satisfy the hybrid rule in `db` today. Move-all
   (consistency, every pure core in one place) vs leave (avoid import-path churn).
   Recommend: move them when `core` lands so "pure logic lives in core" is a clean
   invariant — but it is optional and behaviour-neutral. **Owner: lead architect.**
3. **FK delete behaviour on `captain_promotion_requests.requested_by_user_id`** —
   `cascade` (default) vs `set null` + nullable (audit retention of a deleted
   requester). **Owner: data owner.**
4. **PII: plaintext member email on the roster detail panel** (plan 05 OQ#1, db-impact
   `notes`). ⛔ Blocking for that field — do not ship plaintext email without a recorded
   mitigation (redact / reveal-gate / accept). **Owner: data owner.** The rest of
   roster ships without it.
5. **Content reconciliations gating the questionnaire catalogue move** (plan 03 Step 0):
   `team_interest` range 0–5 vs 0–6 (one constant); hardware-competency page keep-vs-merge
   (12 vs 11 pages); copy edits. Must be locked before editing the catalogue. **Owner:
   product.** (Non-schema.)
6. **MCP decision pass** (plan 08 Step 2): style vs leave-raw the 3 extra 403 branches;
   distinct `rejected` message; `redactIdDocuments` delete-vs-wire; 4 capability
   predicates delete-vs-keep; in-app `aiDataConsent` toggle placement; footnote
   destination. **Owner: product + lead architect.**
7. **Questionnaire trio scope** (S25→S26→S27 sequential Safety/Dietary/Agreements queue)
   — product confirmation, not schema (rides existing `required_actions`). Gates
   surface 27 + multi-queue behaviour. **Owner: product.**
8. **Status-token OKLCH values** (`success`/`warning`) contrast-check against
   `--color-background`, and `--overlay` alpha — lock before component build
   (foundations §5 / §7). **Owner: design.**

WROTE design/spec/impl/architecture.md
