# Roster, approvals & captain-promotion (THE schema change) — service-layer plan

Scope: the captain-only roster surface (`/captains/camp-management`, spec
`surfaces/14-roster.md`), the approve/reject decision flow, member-detail
(profile + decrypted government ID behind the captain gate), and **the only
schema change in the whole redesign** — the two-sided captain-promotion
double-opt-in (`captain_promotion_requests` table + `promotion_request_status`
enum, decision #4). Almost all of the roster/approval logic already exists and
is REUSE; the genuine new build is the promotion handshake and its acceptance
surface (home rank-section / notifications).

---

## Consumers — which surfaces/organisms depend on this domain

| Consumer | Surface / file | What it needs from this domain |
|---|---|---|
| Roster table + stats strip | `surfaces/14-roster.md`; route `apps/web/app/captains/camp-management/page.tsx`, client `camp-management-roster.tsx` | `getCampManagementRoster()` rows → `toRosterRow()` view-models; **derived** stat counts (Members/Approved/Incomplete) and chip counts (All/Pending/Captains/Outstanding) |
| Inline member profile (`MemberProfile`) | `surfaces/14-roster.md §5`; `getMemberDetailAction` | `getCampMemberDetail()` + ID decrypt + `presentMemberDetail()` view-model |
| Approve / Reject footer | `surfaces/14-roster.md §5/§7`; `decideApprovalAction` | `decideUserApproval()` write with self-guard + audit stamp |
| Assign-captain dialog (NEW) | `surfaces/14-roster.md §6`; new action | NEW `sendCaptainPromotion()` + open-request lookup for step state |
| **Acceptance surface** (home rank-section / notifications) | `surfaces/06-home.md` (rank-grouped IA, preview-but-locked) + `surfaces/09-notifications.md` | NEW `listIncomingPromotionRequests()`, `acceptCaptainPromotion()`, `declineCaptainPromotion()` — where the **target** acts |
| Approval gate / pending screen | `surfaces/05-approval-gate.md`; `lib/users.ts isApproved` | reads `approvalStatus` set here (downstream, not changed) |
| CaptainLock preview-but-locked gating | both breakpoints, decision #3 | the page returns **zero rows** to non-captains (already implemented) |

---

## Current state — modules + key exports today (with file:symbol cites)

### `packages/db` — schema + data-access (REUSE)
- `packages/db/src/schema.ts`
  - `schema.ts:31` `rankEnum = pgEnum("rank", ["captain","member"])` — stored rank; `team_lead`/`driver` are derived, never stored.
  - `schema.ts:41-45` `approvalStatusEnum = pgEnum("approval_status", ["pending","approved","rejected"])`.
  - `schema.ts:220-303` `users` table: `id`, `displayName`, `profileImageUrl` (`:229`), `rank` (`:231`), `isSystem` (`:234`), `approvalStatus` (`:267`), `approvalDecidedByUserId` (`:270`, FK→users, onDelete set null), `approvalDecidedAt` (`:274`), `passportEncrypted`/`saIdEncrypted` (`:241-242`), `inviteCode` (`:260`), `sanitised` (`:279`), `telegramHandle` (`:288`), `createdAt` (`:301`).
  - `schema.ts:446-462` `teamMemberships` (`userId`,`team`,`isLead`) — derives Lead badge + team chips + Team filter.
  - `schema.ts:51` `teamEnum` (8 teams) — the Team dropdown domain.
  - `schema.ts:594` `requiredActions.status` — the `pendingRequiredActions` / Outstanding signal.
- `packages/db/src/roster.ts` — the roster data-access module:
  - `roster.ts:15` `interface CampManagementMember` (flat per-member facet shape).
  - `roster.ts:48` `getCampManagementRoster(): Promise<CampManagementMember[]>` — one row per **non-system, non-sanitised** member (`roster.ts:89-91` `where(and(isSystem=false, sanitised=false))`); aggregates `isLead`, `teams`, `pendingRequiredActions`, `country`, driver facets via correlated subqueries; ordered by display name.
  - `roster.ts:117` `interface CampMemberDetail`; `roster.ts:141` `getCampMemberDetail(userId)` — full per-member detail with aliased `decider`/`inviter` joins (`roster.ts:145-146`), returns encrypted ID columns (`roster.ts:158-159`) for the caller to decrypt.
  - `roster.ts:204` `isTeamLead(userId): Promise<boolean>` (also re-exposed via `lib/users.ts isTeamLead`).
- `packages/db/src/burner-profile.ts` — the approval/rank writes:
  - `burner-profile.ts:54` `setUserApprovalStatus(userId, status)` — no-decider variant (signup queue).
  - `burner-profile.ts:69` `setUserApproval({userId, status, decidedByUserId})` — **audit-stamping** captain decision (sets `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`).
  - `burner-profile.ts:94` `setUserRank(userId, rank)` — one-sided direct rank write. **This is exactly why a new table is needed: it cannot model a two-sided handshake.**
- `packages/db/src/crypto.ts` — `encrypt`/`decrypt`/`decryptOrNull` (`crypto.ts:72`) AES-256-GCM via `PGCRYPTO_KEY`; fail-closed `decryptOrNull` (catch → null).
- `packages/db/src/id-documents.ts` — pure helpers `splitIdNumber`/`mergeIdNumber` (`id-documents.ts:28`)/`idColumnsFor`; merges decrypted `id.number` back into `responses` for rendering.
- `packages/db/src/activations.ts` — pattern reference for a durable per-user obligation: `ensureRequiredAction` (`:138`, `onConflictDoNothing` idempotency), `satisfyRequiredAction` (`:167`), `getPendingRequiredActions` (`:203`).

### `apps/web/lib` — app orchestration
- `apps/web/lib/camp-roster.ts` — **pure** view-model layer (no `server-only`, no I/O):
  - `camp-roster.ts:8` `type RosterStatus`; `camp-roster.ts:15` `interface RosterRow`.
  - `camp-roster.ts:60` `toRosterRow(member): RosterRow` — status-precedence derivation + country resolution + `awaitingApproval` flag.
  - `camp-roster.ts:97` `rankLabel(rank, isLead)` — Captain > Team Lead > Member.
- `apps/web/lib/member-detail.ts` — **pure** presenter (explicitly *not* `server-only`, comment `member-detail.ts:6-10`; tested under jsdom):
  - `member-detail.ts:111` `presentMemberDetail(detail): PresentedMember` — groups questionnaire answers by page, builds overview, resolves the avatar, `describeApproval` (`:87`).
- `apps/web/lib/users.ts` — Next-coupled facade (real-vs-test backend split):
  - `users.ts:219` `hasCampAccess`, `users.ts:231` `isApproved`, `users.ts:244` `isTeamLead`, `users.ts:253` `decideUserApproval` (routes to `setUserApproval`), `users.ts:60` `ensureCampUser`.
- `apps/web/app/captains/camp-management/`:
  - `page.tsx` — server gate (auth → camp-access → approved redirects), then `isCaptain ? roster.map(toRosterRow) : []` (`page.tsx:31-33`) — preview-but-locked already returns zero rows to non-captains.
  - `actions.ts` — `"use server"`; `requireCaptain()` (`actions.ts:30`, re-checks rank on every action), `getMemberDetailAction` (`:46`, decrypts ID via `decryptOrNull` + `mergeIdNumber`), `decideApprovalAction` (`:75`, decision whitelist + self-guard `userId === captainId` `:85` + `revalidatePath`).
  - `camp-management-roster.tsx` — client component (search/filter/modal).

### `packages/types`
- `roles.ts:5` `Rank = z.enum(["captain","team_lead","member"])` (note: includes `team_lead`, which is **derived**, not in the DB enum — the live asymmetry the spec flags).
- `roles.ts:10` `Team` enum (8 teams, kept in sync with `teamEnum`).
- `member.ts:47` `MemberProfile` zod. No roster/promotion types exist in `packages/types` today (the roster view-models live in `lib/camp-roster.ts`, the DB shapes in `roster.ts`).

### Existing tests (`apps/web/lib/__tests__/`)
- `camp-roster.test.ts` — exercises `rankLabel` + `toRosterRow` with a `member()` factory.
- `member-detail.test.ts` — exercises `presentMemberDetail` (jsdom).
- `account.test.ts`, `id-documents.test.ts` (likely under `packages/db` — verify), `required-actions.test.ts`, `versions.test.ts` — patterns to mirror for new pure logic.

---

## Redesign delta — NEW / EXTEND vs REUSE

Per the locked plan, **most of this domain is REUSE**. The redesign is overwhelmingly app-layer/presentation; the single persisted new concept is captain-promotion.

### REUSE (exists, keep as-is)
- `getCampManagementRoster()` — already excludes `is_system` **and** `sanitised` (decision satisfied; `roster.ts:89-91`).
- `getCampMemberDetail()` + the ID-decrypt path (`decryptOrNull` + `mergeIdNumber`) behind `requireCaptain()` — already the captain-gated decrypt the spec asks for (`actions.ts:58-65`).
- `decideApprovalAction` / `decideUserApproval` / `setUserApproval` — approve/reject with **decision whitelist** (`actions.ts:82`), **self-guard** (`actions.ts:85`), **audit stamp** (`burner-profile.ts:77-82`). Spec §Validation "decision whitelist / self-decision blocked / audit stamps decider + timestamp" already met.
- `toRosterRow` / `rankLabel` / `presentMemberDetail` — the pure view-models; already derive status, country, rank labels, grouped profile.
- Preview-but-locked zero-rows behaviour for non-captains (`page.tsx:31-33`) — decision #3 already implemented at this surface (page does NOT hard-redirect non-captains; only redirects un-onboarded / unapproved viewers).

### EXTEND (modify existing, small)
- **Derived stat + chip counts** (spec §2 stats strip, §3 filter chips): the boards add `Members / Approved / Incomplete` cards and `All / Pending / Captains / Outstanding / Team:` chips with **live counts**. These are **pure reductions over the existing `RosterRow[]`** — no DB. Add a pure `deriveRosterStats(rows: RosterRow[])` to `lib/camp-roster.ts` (counts must reconcile across stats, chips, and visible rows — spec §Validation "Counts must reconcile"). EXTEND `lib/camp-roster.ts`.
- **Search/filter predicates** (spec §3): search now spans name / **handle** / **email** / country / team; chips filter by `approvalStatus==='pending'` / `rank==='captain'` / `pendingRequiredActions>0` / team membership. The filtering itself is client-side, but the **predicate helpers** are pure and should be unit-testable — add `matchesRosterQuery(row, query)` + `matchesChip(row, chip)` to `lib/camp-roster.ts`. EXTEND.
- **@handle on the roster row**: reuse `users.telegramHandle` (decision/spec §Data "@handle: reuse `telegram_handle`"). EXTEND `getCampManagementRoster` SELECT to add `telegramHandle` and `CampManagementMember.handle: string | null`; EXTEND `RosterRow.handle` (fallback when null: derive a slug from display name OR show no handle — confirm, spec open-question #2). **No new column.**
- **Email on the profile**: sourced from the **auth identity** (Neon Auth `primaryEmail`), not a `users` column. The detail action already has the auth user available via `requireCaptain`/`getAuthenticatedUser`, but it currently fetches the *acting captain*, not the *target's* email. EXTEND the detail path to resolve the target member's email from the auth service (or document that it stays unshown). **⛔ PII OPEN DECISION (spec open-question #1) — do not ship plaintext email without the data owner's recorded mitigation.** This plan treats email as **deferred/flagged**, not built, until that decision lands.
- **Assign-captain action visibility flags** on the detail view-model: `presentMemberDetail` (or the action result) should expose `canAssignCaptain` (viewer is captain && target not captain && not self) and the **in-flight request step state**. EXTEND.

### NEW (build)
- **`captain_promotion_requests` table + `promotion_request_status` enum** — the only schema change (below).
- **`packages/db/src/captain-promotion.ts`** — new data-access module for the handshake (below).
- **`packages/types` promotion types** — `PromotionRequestStatus` enum + request shapes (below).
- **`packages/core` (NEW, pure)** — promotion **state-machine guards** (pure transition validation), extracted so they are framework-agnostic and unit-tested without a DB.
- **App actions** — `sendCaptainPromotionAction` (roster, captain side) + `acceptCaptainPromotionAction` / `declineCaptainPromotionAction` / `cancelCaptainPromotionAction` (acceptance surface, target/captain side). Next-coupled (`"use server"`, auth/session, `revalidatePath`).
- **Acceptance read** — `listIncomingPromotionRequests(userId)` for the home rank-section / notifications surface (where the **target** accepts).

### DELETE (dead)
- None in this domain. (The bespoke `MemberReadOnly` / `RedactedID` / `LockedActions` terminal panel the spec drops is **presentation/component** layer, not service-layer — out of scope here. The `setUserRank` one-sided write stays — it is still used by invite-code rank stamping `users.ts:132`, the intentional code-minted-captain bypass, spec open-question #4.)

---

## Schema & types — the one schema change + `packages/types` additions

### New enum + table (`packages/db/src/schema.ts`)

Add alongside the other enums (after `approvalStatusEnum`, `schema.ts:45`):

```ts
// Captain-promotion double-opt-in lifecycle. A captain SENDS a request; the
// target must ACCEPT in their own app before rank flips (a two-sided
// agreement — no captain can self-assign it for someone). Terminal states:
// declined (target said no), cancelled (requester withdrew).
export const promotionRequestStatusEnum = pgEnum("promotion_request_status", [
  "sent",
  "accepted",
  "declined",
  "cancelled",
]);
```

Add the table near `teamMemberships` / the user-scoped tables (it is a rank
audit log, conceptually adjacent to `approval_decided_*` on `users`):

```ts
// Captain-promotion requests — the ONLY new persisted concept in the redesign
// (decision #4). setUserRank is a one-sided write and cannot model the
// captain→target handshake. A `sent` row is durable pending state; rank flips
// to 'captain' ONLY when the target transitions it to 'accepted' in their own
// app. At most one open ('sent') row per (target) — see partial unique index.
export const captainPromotionRequests = pgTable(
  "captain_promotion_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: promotionRequestStatusEnum("status").notNull().default("sent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { mode: "date" }),
  },
  (t) => ({
    // Idempotency: at most one OPEN ('sent') request per target. Subsequent
    // sends reuse the open row rather than duplicating (spec §Validation
    // "in-flight/duplicate requests … should be idempotent").
    openPerTarget: uniqueIndex("captain_promotion_open_per_target_idx")
      .on(t.targetUserId)
      .where(sql`${t.status} = 'sent'`),
    targetIdx: index("captain_promotion_target_idx").on(t.targetUserId),
  }),
);
```

Notes:
- FK `onDelete: "cascade"` matches `team_memberships`; if audit retention of a deleted requester is wanted, switch `requestedByUserId` to `set null` + make it nullable (matches `approvalDecidedByUserId`). **Confirm** — default to `cascade` for both unless audit retention is required.
- The partial unique index is the DB-level guarantee behind the app's idempotent-send rule. `sql` and `uniqueIndex`/`index` are already imported (`schema.ts:13,16`).
- No column drops, no enum-member removals. **Forward, non-breaking, no DB nuke** (db-impact.json `nukeRecommended:false`).

### Drizzle migration steps
This repo uses drizzle-kit with `out: ./migrations` (numbered `0000`…`0011`).
1. Edit `packages/db/src/schema.ts` — add `promotionRequestStatusEnum` + `captainPromotionRequests` (above).
2. Run `pnpm --filter @camp404/db db:generate` → emits `packages/db/migrations/0012_<name>.sql` containing `CREATE TYPE promotion_request_status …`, `CREATE TABLE captain_promotion_requests …`, the FKs, and `CREATE UNIQUE INDEX … WHERE status = 'sent'`.
3. **Review the generated SQL** — confirm the partial-index `WHERE` clause survived generation (drizzle-kit partial indexes can need a hand-edit; if absent, add the `WHERE status = 'sent'` to the generated `.sql` and the `meta/` snapshot).
4. Apply with `pnpm --filter @camp404/db db:migrate` (CI/deploy) — additive, runs forward against the live DB; god accounts / lineage / audit history preserved (db-impact.json rationale).
5. Add `"./captain-promotion": "./src/captain-promotion.ts"` to `packages/db/package.json` `exports` (mirrors the existing `./roster`, `./crypto` entries `package.json:15,25`).

### `packages/types` additions (`packages/types/src/promotion.ts`, NEW; re-export from `index.ts`)
```ts
export const PromotionRequestStatus = z.enum(["sent","accepted","declined","cancelled"]);
export type PromotionRequestStatus = z.infer<typeof PromotionRequestStatus>;

// View shape for the acceptance surface (home rank-section / notifications).
export const IncomingPromotionRequest = z.object({
  id: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
  requestedByName: z.string().nullable(),
  status: PromotionRequestStatus,
  createdAt: z.date(),
});
export type IncomingPromotionRequest = z.infer<typeof IncomingPromotionRequest>;
```
Keep `roles.ts Rank` as-is (`team_lead` derived; the asymmetry is documented, not fixed here per the locked "presentation only" rule).

---

## Target API — module surface after this work

Legend: lives-in · marking. `packages/core` is NEW (pure, framework-agnostic), per the hybrid decision.

### `packages/db/src/roster.ts` (data-access)
| Symbol | Signature | Marking |
|---|---|---|
| `getCampManagementRoster` | `() → Promise<CampManagementMember[]>` | **EXTEND** (add `handle` from `telegramHandle` to SELECT + interface) |
| `getCampMemberDetail` | `(userId: string) → Promise<CampMemberDetail \| null>` | **REUSE** |
| `CampManagementMember` / `CampMemberDetail` | interfaces | **EXTEND** (`CampManagementMember.handle: string \| null`) |
| `isTeamLead` | `(userId: string) → Promise<boolean>` | **REUSE** |

### `packages/db/src/captain-promotion.ts` (NEW data-access)
| Symbol | Signature | Marking |
|---|---|---|
| `getOpenPromotionRequest` | `(targetUserId: string) → Promise<PromotionRequestRow \| null>` | **NEW** (the `sent` row, for dialog step-state + idempotent send) |
| `sendPromotionRequest` | `({targetUserId, requestedByUserId}) → Promise<PromotionRequestRow>` | **NEW** (insert `status='sent'`; `onConflictDoNothing`/reuse open row — idempotent via partial index) |
| `decidePromotionRequest` | `({requestId, status: "accepted"\|"declined"\|"cancelled"}) → Promise<boolean>` | **NEW** (stamp `decidedAt`; flips only a `sent` row; returns changed) |
| `listIncomingPromotionRequests` | `(targetUserId: string) → Promise<IncomingPromotionRequest[]>` | **NEW** (acceptance surface read; joins requester displayName) |
| `PromotionRequestRow` | interface (raw row shape) | **NEW** |

These are thin Drizzle queries (mirror `activations.ts` style: `createHttpDb()`, `onConflictDoNothing` for idempotency, `returning()` for the inserted/updated row). **They do NOT flip `users.rank`** — the rank write stays a separate, explicit `setUserRank` call orchestrated by the app action only on `accepted`, so the DB module has no cross-table side-effects.

### `packages/core` (NEW, pure) — `packages/core/src/promotion.ts`
| Symbol | Signature | Marking |
|---|---|---|
| `canSendPromotion` | `({viewerRank, viewerId, targetRank, targetId}) → {ok:true} \| {ok:false; reason}` | **NEW** (viewer is captain && target not captain && target≠viewer; spec §Validation "Assign-captain visibility") |
| `canDecidePromotion` | `({actorId, request, decision}) → {ok:true} \| {ok:false; reason}` | **NEW** (accept/decline only by `target`; cancel only by `requestedBy`; only from `sent`) |
| `nextPromotionStatus` | `(current, action) → PromotionRequestStatus \| null` | **NEW** (pure state machine: `sent→accepted\|declined\|cancelled`; everything else → null/invalid) |
| `promotionStepState` | `(request \| null) → {sent: boolean; accepted: boolean}` | **NEW** (drives the dialog's two-step tracker, spec §6) |

Rationale: these are the framework-agnostic business rules (no `next/*`, no DB, no session) — exactly what the hybrid decision says to extract. Pure → unit-testable without a database.

### `packages/db/src/burner-profile.ts`
| Symbol | Signature | Marking |
|---|---|---|
| `setUserApproval` | `({userId, status, decidedByUserId}) → Promise<void>` | **REUSE** |
| `setUserRank` | `(userId, rank) → Promise<void>` | **REUSE** (called by the accept action on `accepted`) |

### `apps/web/lib/camp-roster.ts` (pure view-model — stays in app, see Hybrid)
| Symbol | Signature | Marking |
|---|---|---|
| `toRosterRow` | `(member: CampManagementMember) → RosterRow` | **EXTEND** (carry `handle`) |
| `rankLabel` | `(rank, isLead) → string` | **REUSE** |
| `deriveRosterStats` | `(rows: RosterRow[]) → {members, approved, incomplete, pending, captains, outstanding}` | **NEW** (derived counts; reconcile stats + chips) |
| `matchesRosterQuery` | `(row: RosterRow, query: string) → boolean` | **NEW** (search over name/handle/email/country/team) |
| `matchesChip` / `matchesTeam` | `(row, chip) → boolean` | **NEW** (filter predicates) |

### `apps/web/lib/member-detail.ts` (pure presenter — stays in app)
| Symbol | Signature | Marking |
|---|---|---|
| `presentMemberDetail` | `(detail: CampMemberDetail) → PresentedMember` | **EXTEND** (expose `canAssignCaptain` + `promotionStep`; carry `handle`; email field gated on the PII decision) |

### `apps/web/app/captains/camp-management/actions.ts` (Next-coupled `"use server"`)
| Symbol | Signature | Marking |
|---|---|---|
| `requireCaptain` | `() → {ok,captainId} \| {ok:false,error}` | **REUSE** |
| `getMemberDetailAction` | `(userId) → MemberDetailResult` | **EXTEND** (add open-request lookup → `promotionStep`; PII email gated) |
| `decideApprovalAction` | `(userId, "approved"\|"rejected") → ApprovalDecisionResult` | **REUSE** |
| `sendCaptainPromotionAction` | `(targetUserId) → {ok} \| {ok:false,error}` | **NEW** (`requireCaptain` → `canSendPromotion` → `sendPromotionRequest`; `revalidatePath`) |

### Acceptance surface actions (`apps/web/app/.../actions.ts` near home/notifications — Next-coupled)
| Symbol | Signature | Marking |
|---|---|---|
| `acceptCaptainPromotionAction` | `(requestId) → {ok} \| {ok:false,error}` | **NEW** (auth user = target; `canDecidePromotion` → `decidePromotionRequest("accepted")` → `setUserRank(target,"captain")`; `revalidatePath`) |
| `declineCaptainPromotionAction` | `(requestId) → {ok} \| {ok:false,error}` | **NEW** |
| `cancelCaptainPromotionAction` | `(requestId) → {ok} \| {ok:false,error}` | **NEW** (requester withdraws; from the roster dialog) |

### `apps/web/lib/promotion.ts` (NEW Next-coupled facade — real-vs-test backend)
| Symbol | Signature | Marking |
|---|---|---|
| `listIncomingPromotionRequests` | `(userId) → Promise<IncomingPromotionRequest[]>` | **NEW** (mirrors the `users.ts`/`notifications.ts` real-vs-test split; `import "server-only"`) |
| `getOpenPromotionRequest` / `sendPromotion` / `decidePromotion` wrappers | as DB | **NEW** (route through test store under `E2E_TEST_MODE`) |

---

## Hybrid extraction — what moves to packages vs stays in app

Per the locked HYBRID decision: keep `packages/db` for schema + data-access;
EXTRACT framework-agnostic business logic/validation into packages
(`packages/core` NEW); LEAVE Next-coupled bits in `apps/web`.

### MOVE to packages (pure, framework-agnostic)
- **Promotion state-machine + guards → `packages/core/src/promotion.ts` (NEW)**: `canSendPromotion`, `canDecidePromotion`, `nextPromotionStatus`, `promotionStepState`. No `next/*`, no DB, no session — pure decisions over plain inputs. This is the canonical example of the hybrid extraction: the rules ("only the target accepts", "captain can't promote self", "only `sent` can transition") are business invariants, not framework concerns. Unit-tested in `packages/core`.
- **Promotion types → `packages/types/src/promotion.ts` (NEW)**: `PromotionRequestStatus`, `IncomingPromotionRequest` — shared zod, already the convention (`member.ts`, `roles.ts`).
- **Promotion data-access → `packages/db/src/captain-promotion.ts` (NEW)**: Drizzle queries — belongs in `packages/db` per the "keep packages/db for data-access" rule.

### STAY pure-but-in-app (already pure; relocation optional, not required)
- `lib/camp-roster.ts` (`toRosterRow`, `rankLabel`, new `deriveRosterStats`/predicates) and `lib/member-detail.ts` (`presentMemberDetail`) are **already framework-agnostic** (no `server-only`, tested under jsdom — `member-detail.ts:6-10`). They are **presentation view-models**, not business invariants. Per the hybrid rule the mandatory extraction target is *business logic + validation*; view-model mapping is a softer call. **Recommendation: leave them in `apps/web/lib`** — they import app-local `./countries` and `./questionnaire` catalogues, and moving them would drag those into a package for no behavioural gain. Note them as "pure, app-resident view-models" rather than forcing a move. (If a future consumer outside `apps/web` needs them, revisit.)

### STAY in app (Next-coupled — must not move)
- All `actions.ts` (`"use server"`, `revalidatePath`, `next/cache`) — `decideApprovalAction`, `getMemberDetailAction`, `requireCaptain`, and the NEW promotion actions.
- `page.tsx` (`redirect`, `getAuthenticatedUserOrRedirect`, `force-dynamic`).
- `lib/users.ts` / `lib/notifications.ts` / NEW `lib/promotion.ts` facades — `import "server-only"`, the real-vs-test backend split, and auth/session resolution (`getAuthenticatedUser`, Neon Auth `primaryEmail`).
- **ID decryption call site** stays in `actions.ts` (`decryptOrNull` + `mergeIdNumber`, `actions.ts:58-65`) behind `requireCaptain` — it reads `PGCRYPTO_KEY` and is gated by session; the *crypto primitive* lives in `packages/db/crypto.ts` (REUSE) but the decision to decrypt is an app/auth concern.

Justification: business invariants (who may promote whom, valid transitions) are the genuinely reusable, test-without-a-framework logic → `packages/core`. Everything touching session/auth/`next/*`/`revalidatePath` is request-lifecycle and must stay in `apps/web`.

---

## Build steps — ordered, with acceptance criteria + test approach

1. **Schema + migration (the one change).**
   - Add `promotionRequestStatusEnum` + `captainPromotionRequests` to `schema.ts`; `db:generate` → `0012_*.sql`; verify partial unique index; `db:migrate`.
   - Add `packages/db/package.json` export `./captain-promotion`.
   - *Acceptance:* migration applies forward on a fresh + on a populated DB; no column drops; `\d captain_promotion_requests` shows the partial unique index on `(target_user_id) WHERE status='sent'`.
   - *Test:* migration smoke (apply against a throwaway DB); confirm a second `sent` insert for the same target violates the unique index.

2. **`packages/types/src/promotion.ts`** + re-export from `index.ts`.
   - *Acceptance:* `PromotionRequestStatus` enum + `IncomingPromotionRequest` zod compile and are importable as `@camp404/types`.
   - *Test:* a `*.test.ts` round-tripping `IncomingPromotionRequest.parse(...)` (mirror `member.ts` usage).

3. **`packages/core/src/promotion.ts`** — pure guards + state machine.
   - *Acceptance:* `canSendPromotion` rejects self / non-captain viewer / already-captain target; `canDecidePromotion` allows accept/decline only by target and cancel only by requester, and only from `sent`; `nextPromotionStatus` is a total function over (status, action); `promotionStepState(null)` → both false.
   - *Test:* NEW `packages/core/__tests__/promotion.test.ts` (vitest) — exhaustive transition matrix + every guard branch. This is the highest-value test surface; no DB needed.

4. **`packages/db/src/captain-promotion.ts`** — data-access.
   - *Acceptance:* `sendPromotionRequest` is idempotent (second call with an open row returns the existing row, no duplicate); `decidePromotionRequest` flips only a `sent` row and stamps `decidedAt`; `getOpenPromotionRequest` returns the `sent` row or null; `listIncomingPromotionRequests` returns requests with requester name.
   - *Test:* mirror `activations.test.ts` patterns. (DB-bound queries follow the repo's existing convention — pure logic is covered in step 3; here assert query shape / idempotency contract.)

5. **EXTEND roster read for `@handle`.**
   - `getCampManagementRoster` SELECT + `CampManagementMember.handle`; `toRosterRow`/`RosterRow.handle` carry it; fallback decided (spec OQ#2).
   - *Acceptance:* a member with `telegramHandle` shows it; null handle renders the agreed fallback; roster still excludes system/sanitised.
   - *Test:* EXTEND `camp-roster.test.ts` `member()` factory + a handle/no-handle case.

6. **EXTEND derived stats + filter predicates (pure).**
   - Add `deriveRosterStats`, `matchesRosterQuery`, `matchesChip`/`matchesTeam` to `lib/camp-roster.ts`.
   - *Acceptance:* counts reconcile (Members = all rows; Approved = `approvalStatus==='approved'`; Incomplete/Outstanding = `pendingRequiredActions>0` per the OQ#5 reconciliation; Pending = `approvalStatus==='pending'`; Captains = `rank==='captain'`); search matches across name/handle/email/country/team.
   - *Test:* EXTEND `camp-roster.test.ts` — a fixture set asserting each count + each predicate; an explicit "counts reconcile with filtered rows" assertion (spec §Validation).

7. **`sendCaptainPromotionAction`** (roster, captain side) + EXTEND `getMemberDetailAction` to surface `promotionStep` + `canAssignCaptain`.
   - Wire: `requireCaptain` → `canSendPromotion` (core) → `sendPromotionRequest` (db) → `revalidatePath`. Detail action calls `getOpenPromotionRequest` → `promotionStepState`.
   - *Acceptance:* non-captain → "Captain access only."; self/target-already-captain hidden + re-rejected server-side; send creates exactly one `sent` row (idempotent); rank UNCHANGED on send.
   - *Test:* action-level test with mocked auth + db (mirror existing action tests); assert no rank flip on send.

8. **Acceptance surface — `lib/promotion.ts` facade + accept/decline/cancel actions.**
   - `acceptCaptainPromotionAction`: auth user must equal `request.targetUserId` (via `canDecidePromotion`) → `decidePromotionRequest("accepted")` → `setUserRank(target,"captain")` → `revalidatePath` (home + notifications). `decline`/`cancel` analogous (cancel re-checks requester).
   - Surface placement: home **rank-section** preview / **notifications** inbox (spec OQ#3 → home rank-section / notifications). `listIncomingPromotionRequests` feeds the target's "you've been asked to become captain — Accept / Decline" affordance.
   - *Acceptance:* rank flips to `captain` ONLY on the target's accept; a captain cannot accept their own outgoing request; decline/cancel are terminal and never flip rank; double-accept is a no-op (`decidePromotionRequest` returns false on a non-`sent` row).
   - *Test:* action tests for each transition incl. wrong-actor rejection; `E2E_TEST_MODE` path through the test store.

9. **PII email decision (⛔ blocking, spec OQ#1).** Do NOT render plaintext email until the data owner records a mitigation (redact / reveal-gate / accept). Until then `presentMemberDetail` omits the email field (or shows a masked placeholder). Capture the chosen mitigation + owner in `surfaces/14-roster.md` Open-questions before building the field.

10. **Reconcile open questions** (spec §Open questions): handle fallback (OQ#2), INCOMPLETE/Outstanding/Pending count semantics (OQ#5), profile field subset vs full grouped questionnaire (OQ#6), invite-code captains bypass intentional (OQ#4), demote/revoke out of scope (OQ#8). These are content/product confirmations, not new service-layer code.

---

## Cross-domain dependencies

- **Auth / session (Next-coupled, separate domain):** `getAuthenticatedUser` / `getAuthenticatedUserOrRedirect`, Neon Auth `primaryEmail`, `ensureCampUser`/`hasCampAccess`/`isApproved` (`lib/users.ts`). All actions here re-check the gate server-side (`requireCaptain`, and target-identity check on accept).
- **Users/account domain:** owns `setUserRank` (`burner-profile.ts:94`) — the accept action calls it; and `setUserApproval` for approve/reject. `decideUserApproval` (`users.ts:253`) is the existing facade.
- **Crypto / ID-documents domain:** `decryptOrNull` (`crypto.ts:72`) + `mergeIdNumber` (`id-documents.ts:28`) for the captain-gated ID reveal — REUSE, called from `actions.ts`.
- **Required-actions / activations domain:** supplies `pendingRequiredActions` (the Outstanding/Incomplete signal + stat); `activations.ts` is the architectural template for the new `captain-promotion.ts` (idempotent insert, durable per-user obligation).
- **Notifications / home domain:** the **acceptance surface** (spec OQ#3). The target accepts on the home rank-section preview (`surfaces/06-home.md`) and/or notifications inbox (`surfaces/09-notifications.md`); `listIncomingPromotionRequests` is consumed there. Notifications spec confirms it adds no schema (the promotion table is the only addition).
- **Teams domain:** `team_memberships.is_lead` (`schema.ts:455`) derives the Lead badge / team chips / Team filter — read-only here.
- **Invite-codes domain:** `invite_codes.assignedRank` (`schema.ts:327`) is the OTHER, one-sided rank path (code-minted captains, intentional bypass — spec OQ#4). The double-opt-in is additive, not a replacement.

WROTE design/spec/impl/service-layer/05-roster-approvals-promotion.md