# Identity, access-control & gating spine — service-layer plan

> Domain: the spine that turns "authenticated stranger" → "rank-cleared camp member with a
> rendered surface". Owns: the `AuthenticatedUser` → `CampUser` resolution, the ordered redirect
> chain (`hasCampAccess` → `nextGate` → `isApproved`), god-email bypass, the `rank` (`captain |
> member`) ladder + derived `team_lead`/`driver`, and the LOCKED D3 "preview-but-locked" rank
> mechanism that replaces the hard `redirect("/")` on `/captains/*`.
>
> **Headline:** this domain is ~95% REUSE. The data model and almost every helper already exist
> and already match the spec. The redesign delta is (a) one EXTEND — a single shared "clearance"
> helper/data-shape to replace two ad-hoc captain gates with the uniform preview-but-locked
> contract — and (b) two pure-logic EXTRACTIONS into a new `packages/core`. **No schema change in
> this domain** (the only schema change in the whole redesign — `captain_promotion_requests` — is
> roster's, db-impact.json change #6; this domain only *reads* its eventual `users.rank` effect).

---

## Consumers — which surfaces/organisms depend on this domain

Every authenticated surface depends on the spine; these are the direct consumers of this domain's
exports (grounded in `flows.md §1` and the per-surface state matrix `flows.md §3.2`):

| Consumer (route / module) | What it consumes | Spine role |
|---|---|---|
| **Home** `app/page.tsx:29-63` | `getAuthenticatedUser`, `ensureCampUser`, `hasCampAccess`, `getPendingRequiredActions`+`nextGate`, `getBurnerProfile` (G2b), `isApproved`, `isTeamLead`, derived `viewerRank` | **Owns** the canonical chain; renders the held screen for G0 (`LandingHero`) and redirects for G1/G2/G2b/G3. |
| **Landing** `app/page.tsx:33` (`LandingHero`) | result of `getAuthenticatedUser()===null` | G0 held screen (NOT a redirect). |
| **Auth shells** `02-auth.md` (`/auth/*`) | `getAuthenticatedUser` (read-back), `AuthenticatedUser` shape | Pre-spine; carries **none** of the gating states (`02-auth.md §States`). |
| **Invite gate** `03-invite-gate.md` (`/signup/required`) | `ensureCampUser`, `hasCampAccess`, `isGodEmail`, `redeemInviteForUser`, `claimInviteCode` | G1 held screen; self-bounces to `/` when access regained. |
| **Approval gate** `05-approval-gate.md` (`/pending-approval`) | `ensureCampUser`, `hasCampAccess`, `isApproved`, `getBurnerProfile` | G3 held screen; re-runs G1→G2b→G3 defensively. |
| **Onboarding wizard / runner** S25/S26 | `getPendingRequiredActions`, `nextGate`, `satisfyBurnerProfileAction`, re-asserts G1 | G2 held screen + its satisfy path. |
| **Captain roster** `/captains/camp-management` | rank clearance (`isCaptain`), `requireCaptain` (actions), `decideUserApproval` | **D3 preview-but-locked** (whole surface). |
| **Captain tools** `/captains/tools` + **announcements** `/captains/announcements` | rank clearance | Currently **hard redirect** → must become **D3 preview-but-locked** (delta). |
| **Captain actions** `captains/.../actions.ts` (`requireCaptain`) | `ensureCampUser`, `hasCampAccess`, rank check | Defensive server-side re-assertion (`flows.md §1.3`). |
| **MCP connect** `/mcp/connect` + `lib/mcp/access.ts` | a `{ hasCampAccess, isApproved }`-shaped object | Its own 403 consent gate (NOT spine), but keys on the SAME predicates. |
| **Avatar / image proxy** | `findCampUserByAuthId` (read-only hot path, `users.ts:174`) | Per-request access check without cookie writes. |
| **Make-captain (D4)** — roster + Home banner | will WRITE `users.rank='captain'` on `accepted`; this domain owns `rank` semantics | Cross-domain (roster owns the table; see §Cross-domain). |

---

## Current state — modules + key exports today

Grounded in the live files. Cite format `file:symbol`.

### `packages/db` (schema + data-access)

- `packages/db/src/schema.ts:31` `rankEnum = pgEnum("rank", ["captain","member"])` — comment
  (`schema.ts:27-30`) is explicit: only `captain | member` are stored; `team_lead`/`driver` are
  **derived at read time, never stored**.
- `packages/db/src/schema.ts:41-45` `approvalStatusEnum = pgEnum("approval_status",
  ["pending","approved","rejected"])`; `users.approvalStatus` (`schema.ts:267`)
  `.notNull().default("approved")`.
- `packages/db/src/schema.ts:231` `users.rank.notNull().default("member")`.
- `packages/db/src/roster.ts:204` `isTeamLead(userId): Promise<boolean>` — derived `team_lead`
  (existence check over `team_memberships.is_lead`).
- `packages/db/src/roster.ts:48` `getCampManagementRoster()` / `:141` `getCampMemberDetail()` —
  carry doc-comments "callers MUST gate this behind a captain rank check… renders a locked,
  data-free shell for everyone else" — i.e. the data layer *already* assumes preview-but-locked.
- `packages/db/src/account.ts:21` `sanitisedUserPatch` (pure) / `:55` `sanitiseAccount` —
  account erasure; severs `authUserId` → `deleted:<id>` so a re-login is access-less.
- `packages/db/src/burner-profile.ts` — `findUserByAuthId`, `createCampUser`, `setUserRank`,
  `setUserApprovalStatus`, `setUserApproval`, `setUserInviteCode` (used by `users.ts:3-16`).
- `packages/db/src/invite-codes.ts:57` `consumeInviteCode` (atomic) / `:26` `findUsableInviteCode`
  / `:5` `type AssignedRank = "captain" | "member"`.

### `packages/types`

- `packages/types/src/roles.ts:5` `Rank = z.enum(["captain","team_lead","member"])` — the global
  rank ladder INCLUDING derived `team_lead` (the only place all three coexist as a type).
  **NOTE the divergence:** the *stored* enum is two members (`rankEnum`), this Zod ladder is three.
  `team_lead` here is the derived/clearance rank, not a storable value.
- `packages/types/src/roles.ts:10` `Team = z.enum([...8 teams...])`.

### `apps/web/lib` (orchestration — all `import "server-only"`)

- `apps/web/lib/auth.ts:35` `getAuthenticatedUser()` / `:127` `getAuthenticatedUserOrRedirect()`
  / `:13` `interface AuthenticatedUser`. **Next-coupled** (`next/headers`, `next/navigation`,
  Neon Auth, the RSC cookie-write fallback `:43-58`, `:86` `readSessionWithoutCookieWrite`).
- `apps/web/lib/neon-auth.ts:25` `auth = createNeonAuth(...)`. **Next-coupled** (Better Auth /
  `@neondatabase/auth/next/server`).
- `apps/web/lib/access-control.ts:28` `isGodEmail(email)` (pure-ish: reads `process.env.GOD_EMAILS`)
  / `:43` `claimInviteCode(code)` / `:10` `interface ClaimedInvite` / `:59` `isEnvCode`
  (reads `process.env.INVITE_CODES`).
- `apps/web/lib/users.ts` — the spine's heart:
  - `:60` `ensureCampUser(authUser): Promise<CampUser>` (god auto-create; else synthetic `id:""`).
  - `:111` `redeemInviteForUser(authUser, rawCode)` (G1 mutation).
  - `:174` `findCampUserByAuthId(authUserId)` (read-only hot path).
  - `:219` `hasCampAccess(user, email)` **(pure)** = `isGodEmail(email) || !!user.inviteCode`.
  - `:231` `isApproved(user, email)` **(pure)** = `isGodEmail(email) || approvalStatus==="approved"`.
  - `:244` `isTeamLead(userId)` (delegates to db, test-backend returns false).
  - `:212` `getPendingRequiredActions`, `:204` `satisfyBurnerProfileAction`, `:192`
    `seedBurnerProfileAction`, `:253` `decideUserApproval`.
  - `:39` `interface CampUser` (`id, authUserId, displayName, profileImageUrl, inviteCode, rank,
    approvalStatus`); `:462` `toCampUser` mapper; `:264` `UserBackend` real/test split.
- `apps/web/lib/required-actions.ts:23` `nextGate(actions): string | null` **(pure)** + `:7`
  `ACTION_ROUTES` registry + `:13` `interface PendingAction`. The "never strand" guarantee.
- `apps/web/lib/test-mode.ts:11` `isE2ETestMode()` / `:9` `TEST_USER_COOKIE`. **Next-coupled** via
  callers, but the flag itself is a pure env read.
- `apps/web/lib/test-store.ts:150` `testStore` — process-global in-memory backend; mirrors the
  user/invite shape (`TestRank = "captain"|"member"`, `TestApprovalStatus`).

### App routes asserting the spine / rank

- `apps/web/app/page.tsx:29-63` — canonical chain (G0→G3) + `:73-78` `viewerRank` derivation.
- `apps/web/app/captains/camp-management/page.tsx:29-33` — **already** preview-but-locked:
  `isCaptain = rank==="captain"`; `rows = isCaptain ? roster : []`; `<… locked={!isCaptain} />`.
- `apps/web/app/captains/tools/page.tsx:51-53` — **hard redirect** `redirect("/")` (the D3 delta).
- `apps/web/app/captains/announcements/page.tsx:28-29` — **hard redirect** `redirect("/")` (D3 delta).
- `apps/web/app/captains/camp-management/actions.ts:30` `requireCaptain()` — the server-action
  clearance gate (returns `{ok,error}` not a redirect).

### Shared UI clearance (already implements the D3 *presentation*)

- `packages/ui/src/components/control-panel.tsx:13` `ControlPanelRank =
  "camp_member"|"team_lead"|"captain"`; `:16` `RANK_ORDER` (low→high); `:31` `rankLevel(rank)`;
  `:118` `unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` → per-layer `locked` prop
  with a `Lock` icon (`:300`). This is the **canonical clearance comparator** and the Home
  per-group preview-but-locked mechanism — already built.

### Existing tests (`__tests__`)

- `apps/web/lib/__tests__/required-actions.test.ts` — `nextGate` (empty, route map, skip
  non-blocking, skip unmapped, order). 5 cases.
- `apps/web/lib/__tests__/auth.test.ts` — `getAuthenticatedUser` RSC cookie-write fallback. 5 cases.
- `apps/web/lib/__tests__/camp-roster.test.ts` — roster row derivation (status precedence).
- `apps/web/lib/mcp/__tests__/access.test.ts` — `{hasCampAccess,isApproved}` gate messaging.
- **No test today** for `hasCampAccess` / `isApproved` / `isGodEmail` directly (they're pure and
  trivially testable — a gap to close when extracted).

---

## Redesign delta — NEW / EXTEND vs REUSE

| Item | Verdict | Why |
|---|---|---|
| Stored `rank` enum (`captain｜member`) | **REUSE** | db-impact.json confirms no change; `team_lead`/`driver` stay derived (`schema.ts:27-30`). |
| `approval_status` enum + gate | **REUSE** | db-impact change #5: roster "Accepted" is a label-only relabel of `approved`; no field. |
| `hasCampAccess` / `isApproved` ordering | **REUSE** (then **EXTRACT**) | Logic exactly matches `flows.md §1.2` G1/G3. Move pure bodies to `packages/core` (§Hybrid). |
| `nextGate` + `ACTION_ROUTES` "never strand" | **REUSE** (then **EXTRACT**) | Matches `flows.md §1.1` invariant. Move pure logic to `packages/core`. |
| god-email bypass | **REUSE** | `isGodEmail` short-circuits G1+G3 per `flows.md §1.3`; env-driven, app-layer. |
| derived `team_lead` (`isTeamLead`) + `viewerRank` derivation | **REUSE** | `page.tsx:73-78` already does the `captain → team_lead → camp_member` mapping. |
| `rankLevel` clearance comparator | **REUSE** (then **EXTRACT** the pure ladder) | `control-panel.tsx:31` already computes clearance; needs a server-side twin (§Target API). |
| **Preview-but-locked on `/captains/camp-management`** | **REUSE** | `page.tsx:29-33` already does data-withhold + `locked` flag. The pattern to standardise on. |
| **Preview-but-locked on `/captains/tools`** | **EXTEND** | Today `redirect("/")` (`tools/page.tsx:51-53`) → must render shell + `CaptainLock`, no data (`flows.md §1.4`, D3). |
| **Preview-but-locked on `/captains/announcements`** | **EXTEND** | Today `redirect("/")` (`announcements/page.tsx:28-29`) → same D3 conversion. |
| **Shared `requireClearance` helper + result shape** | **NEW** | One framework-agnostic comparator + a `{ cleared, viewerRank, requiredRank }` shape so every captain surface withholds data identically instead of three bespoke gates. Pairs with the shared `CaptainLock` organism (component-library domain). |
| `requireCaptain()` server-action gate | **REUSE / generalise** | `actions.ts:30` stays Next-coupled; optionally re-expressed in terms of the NEW pure comparator. |
| make-captain `rank='captain'` write on accept (D4) | **cross-domain (roster owns table)** | This domain owns `rank` *semantics*; roster owns `captain_promotion_requests`. See §Cross-domain. |
| `redeemInviteForUser` / `claimInviteCode` | **REUSE** | G1 mutation unchanged; invite redesign is app-layer (db-impact #1). |
| G2b legacy `completedAt` fallback (`page.tsx:50-56`) | **REUSE, plan to DELETE later** | `flows.md §1.2` marks it transitional ("drop once seeding confirmed in prod"). Keep this pass. |

---

## Schema & types

### Schema

**No schema change in this domain.** Confirmed three ways:
- `db-impact.json` lists only `captain_promotion_requests` + `promotion_request_status` as NEW,
  and assigns them to the **roster** double-opt-in (change #6), not here.
- `05-approval-gate.md §Data — "Nothing is NEW"`: "No schema changes, no new tables, no new enums."
- `03-invite-gate.md §Enums`: "No new schema changes on this surface."

The only DB hygiene note that touches this domain (raise, don't patch this pass): `schema.ts:454`
comment still claims a team-lead "should carry `users.rank = 'team_lead'`" — stale, since
`team_lead` is **not** a `rankEnum` member (db-impact.json `notes`). Carry as a comment fix.

### `packages/types` additions

Mostly REUSE. The additions formalise shapes that are today scattered inline:

| Type | Verdict | Shape / where |
|---|---|---|
| `Rank` (`roles.ts:5`, 3-member) | **REUSE** | Already the canonical derived ladder. |
| `StoredRank = z.enum(["captain","member"])` | **NEW (small)** | Make the stored-vs-derived split explicit at the type level; `Rank` keeps `team_lead`. Eliminates the `"captain"｜"member"` inline string-union repeated in `users.ts:32`, `test-store.ts:9`, `roster.ts`, `camp-roster.ts`. |
| `ApprovalStatus = z.enum(["pending","approved","rejected"])` | **EXTEND/centralise** | Inline in `users.ts:33`, `test-store.ts:10`, `roster.ts`. Pull to one Zod source mirroring `approvalStatusEnum`. |
| `ViewerRank`/`ControlPanelRank` (`camp_member｜team_lead｜captain`) | **REUSE, consider re-home** | Lives UI-local (`control-panel.tsx:13`) with a comment "kept separate… until that derivation is settled". The derivation is now settled (D3) — candidate to move into `packages/core` so server gates and UI share one ladder (§Target API). |
| `CampUser` (`users.ts:39`) | **REUSE** | Stays where it is — it's the orchestration view-model. Its `rank`/`approvalStatus` fields adopt the new `StoredRank`/`ApprovalStatus`. |

No Drizzle migration steps — there is no schema change. (Migration for `captain_promotion_requests`
is documented in the roster service-layer plan, not here.)

---

## Target API — the function/module surface after this work

Marked **REUSE / EXTEND / NEW / DELETE** with WHERE it lives. `core` = new pure package.

### `packages/core` (NEW — pure, framework-agnostic, no `server-only`, no `next/*`, no DB)

| Symbol | Signature | Verdict |
|---|---|---|
| `hasCampAccess` | `(user: { inviteCode: string｜null }, isGod: boolean) → boolean` | **EXTRACT (from `users.ts:219`)**. Note the param shape change: takes a pre-computed `isGod` boolean, NOT an email — `isGodEmail` stays app-layer (it reads env). Caller passes `isGodEmail(email)`. |
| `isApproved` | `(user: { approvalStatus: ApprovalStatus }, isGod: boolean) → boolean` | **EXTRACT (from `users.ts:231`)**, same `isGod`-param refactor. |
| `nextGate` | `(actions: PendingAction[], routes: Record<string,string>) → string｜null` | **EXTRACT (from `required-actions.ts:23`)**. Parameterise `ACTION_ROUTES` so the registry stays app-layer (routes are Next paths) but the pure traversal moves to core. |
| `rankLevel` / `RANK_ORDER` | `(rank: ViewerRank) → number` | **EXTRACT (from `control-panel.tsx:31`)** so server gates and UI share one comparator. |
| `requireClearance` | `(viewerRank: ViewerRank, requiredRank: ViewerRank) → { cleared: boolean; viewerRank; requiredRank }` | **NEW**. The single preview-but-locked decision. `cleared = rankLevel(viewer) >= rankLevel(required)`. Returned shape is what a captain page passes to its data-fetch guard + to `CaptainLock`. |
| `deriveViewerRank` | `(input: { rank: StoredRank; isTeamLead: boolean }) → ViewerRank` | **NEW** (extracts the ternary at `page.tsx:73-78`): `rank==="captain" ? "captain" : isTeamLead ? "team_lead" : "camp_member"`. Pure; the `isTeamLead` boolean is fetched app-side. |
| `StoredRank`, `Rank`, `ApprovalStatus`, `ViewerRank` (+ Zod) | types | **NEW/RE-HOME** (could equally live in `packages/types`; pick one — see §Hybrid note). |

### `apps/web/lib` (STAYS — Next-coupled / server-only / session / mutations)

| Symbol | Where / verdict |
|---|---|
| `getAuthenticatedUser`, `getAuthenticatedUserOrRedirect`, `AuthenticatedUser` | `auth.ts` — **REUSE**. `next/headers`, `next/navigation`, RSC cookie-write fallback. |
| `auth` (Neon Auth instance) | `neon-auth.ts` — **REUSE**. Better Auth. |
| `isGodEmail`, `isEnvCode` | `access-control.ts` — **REUSE**. Read `process.env` (deployment config, app-layer). |
| `claimInviteCode`, `ClaimedInvite` | `access-control.ts` — **REUSE**. Branches on env vs DB + test store. |
| `ensureCampUser`, `redeemInviteForUser`, `findCampUserByAuthId`, `CampUser`, backends | `users.ts` — **REUSE**. Session→row resolution + mutations + test/real backend split. |
| `hasCampAccess` / `isApproved` (app wrappers) | `users.ts` — **EXTEND → thin re-exports** that call `core.hasCampAccess(user, isGodEmail(email))`. Keeps every current `(user, email)` call-site working; the pure core does the logic. |
| `isTeamLead` (app) | `users.ts:244` — **REUSE** (DB + test-backend split). |
| `getPendingRequiredActions`, `satisfyBurnerProfileAction`, `seedBurnerProfileAction`, `decideUserApproval` | `users.ts` — **REUSE** (DB writes / env-test split). |
| `nextGate` (app wrapper) | `required-actions.ts` — **EXTEND → wrapper** that calls `core.nextGate(actions, ACTION_ROUTES)`; `ACTION_ROUTES` registry stays here (Next paths). |
| `requireCaptain` | `captains/.../actions.ts:30` — **REUSE/generalise**. Stays a server action returning `{ok,error}`; may call `core.requireClearance` internally. |
| `isE2ETestMode`, `TEST_USER_COOKIE`, `testStore` | `test-mode.ts` / `test-store.ts` — **REUSE**. |

### App routes

| Route | Verdict |
|---|---|
| `app/page.tsx` chain + `viewerRank` | **REUSE** — rewire `viewerRank` to call `core.deriveViewerRank`. |
| `captains/camp-management/page.tsx` | **REUSE / align** to the shared `requireClearance` shape. |
| `captains/tools/page.tsx` | **EXTEND** — replace `redirect("/")` with `requireClearance` + shell + `CaptainLock`, fetch tool list only when `cleared`. |
| `captains/announcements/page.tsx` | **EXTEND** — same conversion. |
| **DELETE** | None. (G2b legacy fallback is a *future* delete, not this pass — see Redesign delta.) |

---

## Hybrid extraction — what moves to packages, what stays in app

**Locked rule (CLAUDE.md):** pure business logic + validation → packages; anything importing
`next/*`, `server-only`, auth/session, route/action handlers → stays in `apps/web`.

### MOVE to `packages/core` (pure, no I/O, no env, no Next)

| From | To | Justification |
|---|---|---|
| `users.ts:219` `hasCampAccess` body | `core` | Pure boolean over `inviteCode` + an `isGod` flag. The *only* impurity is `isGodEmail` (env) — lift that out as a passed boolean and the rest is pure. |
| `users.ts:231` `isApproved` body | `core` | Same: pure over `approvalStatus` + `isGod` flag. |
| `required-actions.ts:23-30` `nextGate` traversal | `core` | Already pure (no imports at all today). Parameterise the route map so the Next-path registry stays app-side. |
| `control-panel.tsx:16,31` `RANK_ORDER`/`rankLevel` | `core` | Pure index lookup; UI re-imports it. Lets server gates compute clearance with the same ladder the UI uses (no drift). |
| `page.tsx:73-78` `viewerRank` ternary | `core` (`deriveViewerRank`) | Pure mapping of `(rank, isTeamLead) → ViewerRank`. |
| NEW `requireClearance` | `core` | Pure comparator + result shape; the heart of D3. |
| rank/approval/viewer-rank Zod types | `core` **or** `packages/types` | Pick one. **Recommend `packages/types`** (it already owns `roles.ts`); `core` then imports them. This keeps "types" and "logic" packages cleanly separated and matches the existing `Rank`/`Team` home. |

### STAY in `apps/web/lib` (Next-coupled / session / I/O / env)

| Symbol | Why it cannot move |
|---|---|
| `auth.ts` (all) | `next/headers`, `next/navigation`, Neon Auth, the RSC cookie-write workaround (`:43-58`) — pure framework glue. |
| `neon-auth.ts` | `@neondatabase/auth/next/server`. |
| `isGodEmail` / `isEnvCode` / `claimInviteCode` | Read `process.env.GOD_EMAILS` / `INVITE_CODES`; branch on `isE2ETestMode()` + `testStore`. Env + I/O = app-layer. |
| `ensureCampUser` / `redeemInviteForUser` / `findCampUserByAuthId` | DB writes, test/real backend selection, `seedBurnerProfileAction` side-effects. I/O. |
| `getPendingRequiredActions` / `satisfy*` / `seed*` / `decideUserApproval` | DB I/O, `isE2ETestMode` branches. |
| `requireCaptain` | Reads the session (`getAuthenticatedUser`), is a server action. |
| route/action files (`page.tsx`, `actions.ts`) | `server-only`, `redirect`, `revalidatePath`, RSC. |

**Net:** the *decisions* (who is in, who is approved, what gate is next, what rank clears what)
become pure and unit-testable in `core`; the *I/O and framework wiring* stay in `apps/web`, calling
into `core`. App-layer `hasCampAccess`/`isApproved`/`nextGate` become thin shims so no call-site
changes — they just gain a tested pure core and lose their inline logic.

---

## Build steps (ordered, with acceptance criteria + test approach)

> All steps are plan-doc-only here; this lists the implementation order, each with how to prove it.
> Existing tests to protect: `required-actions.test.ts`, `auth.test.ts`, `camp-roster.test.ts`,
> `mcp/access.test.ts`.

1. **Scaffold `packages/core` + centralise rank/approval types in `packages/types`.**
   Add `StoredRank`, `ApprovalStatus`, `ViewerRank` to `roles.ts` alongside the existing `Rank`.
   - *Acceptance:* `packages/types` builds; `users.ts`/`test-store.ts`/`roster.ts`/`camp-roster.ts`
     can replace their inline `"captain"｜"member"` / approval unions with the shared types with no
     behaviour change. *Test:* typecheck + existing suites green.

2. **Extract `nextGate` to `core` (parameterised routes); app keeps `ACTION_ROUTES` + a wrapper.**
   - *Acceptance:* `required-actions.test.ts` passes unchanged when pointed at the wrapper; add
     core-level cases that pass an explicit route map. *Test:* port the 5 existing `nextGate` cases
     to `core` + keep the wrapper test (registry shape).

3. **Extract `hasCampAccess` / `isApproved` to `core`; app wrappers pass `isGodEmail(email)`.**
   - *Acceptance:* every current call-site (`page.tsx`, `/signup/required`, `/pending-approval`,
     `camp-management/page.tsx`, `mcp/access`) compiles unchanged. *Test:* NEW core unit tests
     covering the truth table — god bypass true regardless of `inviteCode`/`approvalStatus`;
     non-god gated on `inviteCode` (G1) and `approvalStatus==="approved"` (G3). (Closes the current
     no-direct-test gap.)

4. **Extract `rankLevel`/`RANK_ORDER` + add `deriveViewerRank` + `requireClearance` to `core`;
   re-import into `control-panel.tsx`; rewire `page.tsx:73-78` to `deriveViewerRank`.**
   - *Acceptance:* Home renders identical layers per rank; control-panel locking unchanged.
     *Test:* NEW core tests — `requireClearance` truth table (captain clears all; team_lead clears
     member+lead, NOT captain; member clears only member); `deriveViewerRank` for the three inputs.

5. **Convert `/captains/tools` and `/captains/announcements` from hard-redirect to preview-but-locked.**
   Use `requireClearance` to gate the data fetch (return `[]`/empty when not `cleared`), render the
   shell + the shared `CaptainLock` ("VIEW ONLY · no data for your rank") — mirroring the existing
   `camp-management/page.tsx:29-33` pattern. Keep the upstream spine checks (`hasCampAccess`,
   `isApproved`) as redirects — only the *rank* gate becomes a soft-lock (`flows.md §1.4`: G3 still
   redirects, rank does not).
   - *Acceptance (per `flows.md §3.3` invariant #2):* a non-captain who navigates to
     `/captains/tools` or `/captains/announcements` gets a 200 with chrome + `CaptainLock` and
     **zero data rows** (server withholds; not dimmed-but-populated). A captain gets full data.
     *Test:* E2E via `E2E_TEST_MODE` test login as `rank:"member"` → assert page renders, asserts
     no tool/announcement payload in the response; as `rank:"captain"` → asserts data present.
     Unit: the page's data-fetch branch returns `[]` when `!cleared`.

6. **Align `camp-management/page.tsx` + `requireCaptain` onto the shared `requireClearance`.**
   No behaviour change — it already withholds data; this just routes its decision through the one
   comparator so all four captain surfaces are uniform.
   - *Acceptance:* `camp-management` still locked for members, full for captains; `decideApprovalAction`
     still rejects non-captains and self-decisions (`actions.ts:82-87`). *Test:* keep
     `camp-roster.test.ts`; add a `requireCaptain`→`requireClearance` equivalence unit test.

7. **(Defensive-spine regression guard — no code change, add coverage.)** Add a spine-order test
   asserting G1→G2→G2b→G3 ordering and god-email short-circuit at G1+G3, encoding `flows.md §1.2`
   so a future reorder fails loudly.
   - *Acceptance:* a test that feeds a synthetic user through the (now-pure) predicates in order and
     asserts the first failing gate. *Test:* pure `core` composition test.

---

## Cross-domain dependencies

- **Roster / camp-management** (`packages/db/src/roster.ts`, `lib/camp-roster.ts`,
  `lib/member-detail.ts`): consumes this domain's clearance (`requireCaptain`/`requireClearance`)
  and `decideUserApproval`. Owns `getCampManagementRoster`/`getCampMemberDetail` data and the
  approval-decision UI. The **D4 make-captain** table (`captain_promotion_requests` +
  `promotion_request_status`) is **owned by roster** (db-impact #6); this domain only contributes
  the `users.rank='captain'` write that fires on the `accepted` transition (`flows.md §2e`:
  "only the target's accept… writes `users.rank = 'captain'`"). The Home `PendingPromotionBanner`
  (`flows.md §2e`, §3.1) reads an open `sent` request targeting the viewer — a roster-domain read
  rendered on the Home surface this domain gates.
- **Required-actions / questionnaire** (`packages/db/src/activations.ts`, `lib/questionnaire.ts`,
  `lib/required-actions.ts`): supplies G2's pending obligations and the `ACTION_ROUTES` registry;
  this domain only sequences them (`nextGate`) and seeds/satisfies the burner-profile action. The
  S25→S26→S27 trio (`flows.md §2f`) rides entirely on the existing engine — no schema change,
  sequential unlock is app logic over G2.
- **Invite codes** (`packages/db/src/invite-codes.ts`): G1 redemption (`claimInviteCode` →
  `consumeInviteCode`) and `assigned_rank`/`requires_approval` flags feeding rank + approval. The
  invite *tool* redesign is app-layer (db-impact #1); this domain is unaffected.
- **MCP** (`lib/mcp/access.ts`): independent 403 consent gate that keys on the SAME
  `{hasCampAccess, isApproved}` predicates — should consume the extracted `core` predicates rather
  than re-deriving, to stay in lock-step with the spine.
- **Component library** (`CaptainLock`, `ControlPanel`): the D3 presentation layer. This domain
  produces the `requireClearance` decision + `ViewerRank`; the component domain renders the
  "VIEW ONLY · no data for your rank" shell. `rankLevel`/`RANK_ORDER` are shared between them via
  `core` so server and UI never drift.
- **Account erasure** (`packages/db/src/account.ts`): severs `authUserId` so a sanitised user's
  re-login resolves to a fresh access-less identity through `ensureCampUser` — depends on this
  domain's resolution path but is owned by the account/maintenance domain.
