# 14-roster — app integration plan

- Route(s): `/captains/camp-management` · routed page (App Router, `apps/web/app/captains/camp-management/`)

> The app-layer wiring for surface `surfaces/14-roster.md` (canonical boards #37
> terminal-console / #38 mobile). It grounds every claim in the live route +
> `apps/web/lib` + the per-component plans (`design/spec/impl/components/`) + the
> service plan (`design/spec/impl/service-layer/05-roster-approvals-promotion.md`)
> + `architecture.md` (layering `types ← {db,core} ← ui ← apps`; gating;
> migration 0012). It is a **REDESIGN of a working route**: the page, the
> server actions, and the data-access already exist. This plan classifies each
> file REUSE / EXTEND / NEW / DELETE and orders the build behind its prerequisites.

---

## Current state — the existing route/files today

The route already ships and routes the surface. Three files (one server page, one
client island, one server-actions module) plus the app-resident view-models.

| File | Role today | Cite |
|---|---|---|
| `apps/web/app/captains/camp-management/page.tsx` | **Server component** (`export const dynamic = "force-dynamic"`, `metadata`). Gate: `getAuthenticatedUserOrRedirect()` → `ensureCampUser` → `redirect("/signup/required")` if `!hasCampAccess`, `redirect("/pending-approval")` if `!isApproved`. **Preview-but-locked already partly implemented**: `const isCaptain = campUser.rank === "captain"; const rows = isCaptain ? (await getCampManagementRoster()).map(toRosterRow) : [];` (`page.tsx:29-33`) — non-captains get **zero rows**, NOT a redirect. Renders a `<main className="mx-auto max-w-5xl ...">` (wide-table width, per spec §Breakpoints) with a ghost-back `Button`→`/` labelled "Captains", an `<h1>` "Camp management" + lede, then `<CampManagementRoster rows={rows} locked={!isCaptain} />`. | `page.tsx:19-54` |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx` | **`"use client"` island** (541 lines). Owns `query`/`filter`(`"all"｜"awaiting"`)/`selectedId` state; `awaitingCount` memo; `filtered` memo over `displayName`/`rankLabel`/`country`/`teams` (no handle, no email). Renders an inline counts+filter+search block **hidden when locked** (`{!locked && ...}`, `:113`), a single 7-col `<table>` (Member · Rank · Status · Questionnaires · Driver · In SA · Country), a bespoke locked overlay (`opacity-40 blur-[2px]` + `bg-background/95` `Lock` card, `:159-164,278-289`), and the `MemberModal` (`Dialog`-based, Overview/Profile tabs, Approve/Reject + disabled "Ping"). Off-token `STATUS_STYLE` (`:43-49`), `YesNo` helper, `PlaceholderRows`. | `camp-management-roster.tsx:1-541` |
| `apps/web/app/captains/camp-management/actions.ts` | **`"use server"` actions**. `requireCaptain()` (re-checks rank every call, `:30-43`); `getMemberDetailAction(userId)` (gate → `getCampMemberDetail` → `decryptOrNull` passport/sa-id → `mergeIdNumber` → `presentMemberDetail`, `:46-68`); `decideApprovalAction(userId, "approved"｜"rejected")` (gate → decision whitelist `:82` → self-guard `userId === gate.captainId` `:85` → `decideUserApproval` → `revalidatePath`, `:75-96`). | `actions.ts:1-97` |
| `apps/web/lib/camp-roster.ts` | **Pure, app-resident view-model** (no `server-only`). `RosterStatus`, `RosterRow` (no `handle`), `toRosterRow(member)` (status precedence + country resolve + `awaitingApproval`), `rankLabel(rank, isLead)`. Unit-tested (`__tests__/camp-roster.test.ts`). | `camp-roster.ts:1-101` |
| `apps/web/lib/member-detail.ts` | **Pure, app-resident presenter** (deliberately NOT `server-only`, jsdom-tested). `DetailItem`/`DetailSection`/`PresentedMember` (no `handle`, no `teams[]`, no `statusTag`, no `canAssignCaptain`, no `promotionStep`); `presentMemberDetail(detail)` groups answers by page, builds `overview`, resolves avatar, `describeApproval`. | `member-detail.ts:1-176` |
| `apps/web/lib/users.ts` | **`server-only` facade** (real-vs-test backend split, `testStore` under `E2E_TEST_MODE`). `hasCampAccess`, `isApproved`, `decideUserApproval` (→ `setUserApproval`). | `users.ts:1,30,253` |
| Data-access (REUSE) | `@camp404/db/roster` `getCampManagementRoster` (excludes `is_system`+`sanitised`) / `getCampMemberDetail`; `@camp404/db/crypto` `decryptOrNull`; `@camp404/db/id-documents` `mergeIdNumber`; `@camp404/db/burner-profile` `setUserApproval`/`setUserRank`. | service-layer 05 §Current state |

**No** `layout.tsx`, `error.tsx`, `not-found.tsx`, or `/api` route handler exists
in the route folder today (`find apps/web/app/captains` → only the three files +
the sibling `announcements`/`tools` routes). The app-level `apps/web/app/error.tsx`
+ `not-found.tsx` + `global-error.tsx` cover this route.

### What the redesign changes (vs today)

1. **Layout to Iteration B** (terminal-console ≥ sm + mobile < sm); the single
   7-col Inter table is replaced by the board's row anatomy (status bar, mono-tinted
   avatar, @handle, three-rank role badge, chevron) in a responsive `RosterTable` /
   `RosterList` pair. Live yes/no facets (Questionnaires/Driver/In-SA) move into the
   profile/Outstanding, not roster columns (spec §Divergences).
2. **Stats strip** (MEMBERS / APPROVED / INCOMPLETE) — net-new, absent today.
3. **Multi-chip toolbar** (All / Pending / Captains / Team: / Outstanding) + search
   over name/handle/email/country/team — replaces the 2-way segmented toggle and the
   name/team/country search.
4. **Preview-but-locked fix**: the toolbar is currently **hidden** when locked
   (`{!locked}`, a decision-#3 violation) and the lock uses a bespoke
   `opacity-40 blur-[2px]` + `bg-background/95` overlay. Redesign: chrome renders
   **inert** (not hidden), the bespoke overlay/`MemberReadOnly` is DELETED, the
   shared `CaptainLock` (skin="console") is mounted. Server zero-rows behaviour is
   already correct and KEPT.
5. **Inline `MemberProfile`** replaces the `Dialog`-based `MemberModal`; tabs
   collapse to one scroll; @handle + team badges + separate status/rank tags +
   redacted ID via `CodeDisplay` added.
6. **Assign-captain double-opt-in** (`AssignCaptainDialog` + `OptInStepTracker`) and
   **Reject-confirm** (`RejectConfirmDialog`) — both net-new; reject becomes a
   two-step confirm (was one-click).
7. **Token cleanup**: `STATUS_STYLE`, raw `bg-emerald-600` Approve, `sky/amber/rose`
   tints → status tokens + Badge tones.

---

## File structure — target files in apps/web

All app-local files live in the route folder `apps/web/app/captains/camp-management/`.

| File | Kind | Disposition | Notes |
|---|---|---|---|
| `page.tsx` | server component | **MODIFY** | Keep the auth/camp-access/approved gate + `isCaptain ? rows : []` zero-rows boundary (REUSE the security-relevant lines). Derive the three stat counts server-side (`membersCount`, `approvedCount`, `incompleteCount` from `rows`) and pass to the strip. Update back-affordance copy "Captains" → "Camp tools" (spec §1). Keep `max-w-5xl` (wide-table surface). Pass `locked={!isCaptain}` + `counts` to the client island; render the responsive header chrome (terminal `TermBar`/`TitleRow` ≥ sm, mobile H1 < sm). |
| `camp-management-roster.tsx` | `"use client"` island (root container) | **MODIFY** (heavy) | Stays the client root. Owns `query`/`filter`(→`RosterChip`)/`teamFilter`/`selectedId`. Replace inline table → `<RosterTable>`/`<RosterList>`; replace inline filter/search → `<RosterToolbar>` (mounted **unconditionally**, inert when locked); replace bespoke overlay → `<CaptainLock skin="console">`; replace `MemberModal` → `<MemberProfile>` + mount `<AssignCaptainDialog>` / `<RejectConfirmDialog>` (only in `{!locked}`). DELETE `STATUS_STYLE`, `YesNo`, `PlaceholderRows`, `Filter="all"｜"awaiting"`. Wire `deriveRosterStats`/`matchesRosterQuery`/`matchesChip`/`matchesTeam`. |
| `actions.ts` | `"use server"` | **MODIFY** | KEEP `requireCaptain`, `decideApprovalAction` (REUSE — guards already correct). EXTEND `getMemberDetailAction` to look up `getOpenPromotionRequest` → `promotionStepState` and expose `canAssignCaptain`+`promotionStep`+`handle` on `PresentedMember`. ADD `sendCaptainPromotionAction(targetUserId)` (NEW) + `cancelCaptainPromotionAction(requestId)` (NEW). PII email field stays gated/omitted (OQ#1). |
| `stat-tile.tsx` | `"use client"`-agnostic presentational | **CREATE** | `StatTile` (terminal/compact variants, neutral/success/warning tone). `molecule-stattile.md`. |
| `roster-toolbar.tsx` | `"use client"` | **CREATE** | `RosterToolbar` + exports `RosterChip`. `organism-rostertoolbar.md`. |
| `filter-chip.tsx` | `"use client"` | **CREATE** | `FilterChip` (toggle/dropdown/warning). `molecule-filterchip.md`. |
| `roster-row.tsx` | presentational (inherits parent client) | **CREATE** | `RosterRow` (responsive table/list). `organism-rosterrow.md`. |
| `roster-table.tsx` | presentational | **CREATE** | Terminal `<table>` wrapper + HeaderRow + EmptyState + locked structure. `organism-rosterrow.md` §wrappers. |
| `roster-list.tsx` | presentational | **CREATE** | Mobile `<ul>` wrapper + EmptyState + locked structure. `organism-rosterrow.md` §wrappers. |
| `member-profile.tsx` | `"use client"` | **CREATE** (extracted from `MemberModal`) | Inline profile panel. `organism-memberprofile.md`. |
| `assign-captain-dialog.tsx` | `"use client"` | **CREATE** | `AssignCaptainDialog` + co-located `OptInStepTracker`. `organism-assigncaptaindialog.md`. |
| `reject-confirm-dialog.tsx` | `"use client"` | **CREATE** | `RejectConfirmDialog`. `organism-rejectconfirmdialog.md`. |
| `apps/web/lib/camp-roster.ts` | pure view-model | **MODIFY** | EXTEND `RosterRow.handle`; carry in `toRosterRow`; ADD `deriveRosterStats`, `matchesRosterQuery`, `matchesChip`/`matchesTeam`, `statusToneFor`. Stays app-resident (service-layer 05 §Hybrid "STAY pure-but-in-app"). |
| `apps/web/lib/member-detail.ts` | pure presenter | **MODIFY** | EXTEND `PresentedMember` with `handle`, `bio`, `teams[]`, `statusTag`, `canAssignCaptain`, `promotionStep`; build them in `presentMemberDetail`. Email field gated (OQ#1). |
| `apps/web/lib/promotion.ts` | `server-only` facade | **CREATE** | `listIncomingPromotionRequests` + `getOpenPromotionRequest`/`sendPromotion`/`decidePromotion` wrappers, real-vs-test split (mirrors `users.ts`/`notifications.ts`; service-layer 05 §Target API). `getOpenPromotionRequest` is consumed by `getMemberDetailAction`; `sendPromotion`/`cancel` by the new actions. |

**No new `layout.tsx` / `error.tsx` / `not-found.tsx` / `/api` route handler.** None
exist today and the surface needs none — all reads/writes are server actions, the
app-level boundaries cover errors, and there is no public API. (If a future error
boundary is wanted, it would be `apps/web/app/captains/camp-management/error.tsx` —
out of scope; the app-level `error.tsx` suffices.)

**Acceptance-side actions are NOT in this folder.** `acceptCaptainPromotionAction` /
`declineCaptainPromotionAction` live on the **home rank-section / notifications**
surface (the *target* acts there, surface 06/09; service-layer 05 §Target API; OQ#3).
This surface only **sends/cancels**.

### `packages/*` prerequisites (not app files, but this surface's hard deps)

- `@camp404/db` migration `0012` (`captain_promotion_requests` + `promotion_request_status`) + `captain-promotion.ts` data-access + `roster.handle` EXTEND (service-layer 05 §schema/§Target API).
- `@camp404/types/promotion.ts` (`PromotionRequestStatus`, `IncomingPromotionRequest`).
- `@camp404/core/promotion.ts` (`canSendPromotion`, `canDecidePromotion`, `nextPromotionStatus`, `promotionStepState`) + `initialsFrom` + `avatarTintFor`.
- `@camp404/ui` PROMOTE/NEW: `CaptainLock`, `Badge`, `Avatar` (mono-tinted EXTEND), `CodeDisplay` (redacted), `IconBadge`, `Alert`, `Spinner`, `Divider` + Phase-0 status tokens/fonts.

---

## Components composed

Linked to their plans; each marked server (S) / client (C) and where it renders.

| Component | Plan | Home | Renders in | Marking |
|---|---|---|---|---|
| `StatTile` ×3 (MEMBERS/APPROVED/INCOMPLETE) | [molecule-stattile.md](../components/molecule-stattile.md) | app-local | `page.tsx` strip (S) — counts derived server-side, passed as numbers | NEW |
| `RosterToolbar` | [organism-rostertoolbar.md](../components/organism-rostertoolbar.md) | app-local | client island (C) — controlled, no fetch | NEW |
| `FilterChip` ×5 | [molecule-filterchip.md](../components/molecule-filterchip.md) | app-local | inside `RosterToolbar` (C) | NEW |
| `RosterTable` / `RosterList` | [organism-rosterrow.md](../components/organism-rosterrow.md) §wrappers | app-local | client island (C), responsive `hidden sm:block` / `sm:hidden` | NEW |
| `RosterRow` | [organism-rosterrow.md](../components/organism-rosterrow.md) | app-local | inside the wrappers (C) — presentational, inherits client | NEW |
| `MemberProfile` | [organism-memberprofile.md](../components/organism-memberprofile.md) | app-local | client island, inline panel, mounted only `{!locked}` (C) | NEW (extracted from `MemberModal`) |
| `AssignCaptainDialog` (+ `OptInStepTracker`) | [organism-assigncaptaindialog.md](../components/organism-assigncaptaindialog.md) | app-local | client island, mounted only `{!locked}` + gated on `canAssignCaptain` (C) | NEW |
| `RejectConfirmDialog` | [organism-rejectconfirmdialog.md](../components/organism-rejectconfirmdialog.md) | app-local | client island, mounted only `{!locked}` + while pending (C) | NEW |
| `CaptainLock` (skin="console") | [molecule-captainlock.md](../components/molecule-captainlock.md) | `@camp404/ui` | client island (locked branch) + `RosterTable`/`RosterList` locked structure (C) | PROMOTE |
| `Avatar` (mono-tinted) | [atom-avatar.md](../components/atom-avatar.md) | `@camp404/ui` | inside `RosterRow` + `MemberProfile` head (C) | REUSE+EXTEND |
| `Badge` (status/rank/team/role) | [atom-badge.md](../components/atom-badge.md) | `@camp404/ui` | `RosterRow` role badge + `MemberProfile` tags (C) | PROMOTE |
| `CodeDisplay` (redacted) | [molecule-codedisplay.md](../components/molecule-codedisplay.md) | `@camp404/ui` | `MemberProfile` ID/Passport field (C) | PROMOTE |
| `Button` | [atom-button.md](../components/atom-button.md) | `@camp404/ui` | profile footer + dialogs + ghost-back (S+C) | REUSE |
| `IconBadge` / `Alert` / `Spinner` / `Divider` | their plans | `@camp404/ui` | dialogs + profile footer (C) | PROMOTE/NEW |
| `Dialog`, `Input`, `Popover`, `Command` | `@camp404/ui` primitives | `@camp404/ui` | dialogs frame (`Dialog`), toolbar search (`Input`) + team picker (`Popover`+`Command`) (C) | REUSE |

**Server/client split summary:** `page.tsx` (S) fetches roster + derives stat counts
+ gates; the `StatTile` strip renders server-side. Everything interactive
(`RosterToolbar`, `RosterTable`/`RosterList`, `RosterRow`, `MemberProfile`, both
dialogs) is in the `"use client"` island tree. The heavy `QUESTIONNAIRE` catalogue,
raw answers, and the decrypt key never reach the client — only the flat
`PresentedMember` view-model crosses the server-action boundary (`member-detail.ts`
header comment). The decrypted ID arrives as an already-decrypted string and is
**masked client-side** by `CodeDisplay redacted` (it never re-decrypts).

---

## Services & data

### Reads (server-side, in `page.tsx` or via server action)

- `getCampManagementRoster()` → `CampManagementMember[]` (`@camp404/db/roster`, **REUSE**, EXTEND to add `handle` from `telegramHandle`). Excludes `is_system`+`sanitised` already. Mapped through `toRosterRow` (app, pure). Fetched **server-side** in `page.tsx`; `isCaptain ? … : []` is the preview-but-locked boundary.
- `deriveRosterStats(rows)` (`apps/web/lib/camp-roster.ts`, **NEW**, pure) → `{ members, approved, incomplete, pending, captains, outstanding }`. Used in `page.tsx` for the stat strip AND in the client island for chip counts — single source so **counts reconcile** (spec §Validation; toolbar plan "Counts-must-reconcile invariant").
- `getCampMemberDetail(userId)` (`@camp404/db/roster`, **REUSE**) — full per-member detail with aliased decider/inviter joins + encrypted ID columns. Fetched **on row open** via the server action, not at page load.
- `getOpenPromotionRequest(targetUserId)` (`@camp404/db/captain-promotion`, **NEW**) → the `sent` row or null; called inside `getMemberDetailAction` → `promotionStepState` → `promotionStep` on the view-model.

### Writes / server actions (`actions.ts`)

- `getMemberDetailAction(userId)` — **EXTEND**. `requireCaptain` → `getCampMemberDetail` → `decryptOrNull(passport/sa-id)` + `mergeIdNumber` (REUSE, captain-gated decrypt) → `getOpenPromotionRequest` + `promotionStepState` → `presentMemberDetail`. Returns `PresentedMember` with new `canAssignCaptain`/`promotionStep`/`handle`. Email field gated (OQ#1).
- `decideApprovalAction(userId, "approved"｜"rejected")` — **REUSE**. Guards already correct (whitelist `:82`, self-guard `:85`, audit stamp via `decideUserApproval`→`setUserApproval`, `revalidatePath` `:94`). Approve fires directly; Reject fires through `RejectConfirmDialog` confirm.
- `sendCaptainPromotionAction(targetUserId)` — **NEW**. `requireCaptain` → `core.canSendPromotion({viewerRank, viewerId, targetRank, targetId})` → `db.sendPromotionRequest` (idempotent via partial unique index `WHERE status='sent'`) → `revalidatePath("/captains/camp-management")`. **Never flips `users.rank`.**
- `cancelCaptainPromotionAction(requestId)` — **NEW**. `requireCaptain` → `core.canDecidePromotion` (cancel only by `requestedBy`, only from `sent`) → `db.decidePromotionRequest("cancelled")` → `revalidatePath`.

### `@camp404/core` helpers (pure)

- `canSendPromotion` / `canDecidePromotion` / `nextPromotionStatus` / `promotionStepState` (`packages/core/src/promotion.ts`, **NEW**, service-layer 05 §core). The client receives a **precomputed** `canAssignCaptain` boolean + `promotionStep`; the dialog mirrors `canSendPromotion`/`nextPromotionStatus` for affordance-gating + optimistic flips, but the authoritative check re-runs in the action.
- `initialsFrom(name)` + `avatarTintFor(id)` — consumed by `RosterRow`/`MemberProfile` to feed the `Avatar` atom (atom is logic-free).

### Fetched server-side vs passed as props

- **Server-side (page load):** the roster rows + the three stat counts. These are the only data the page fetches; they are passed as props (`rows`, `counts`, `locked`) into the client island.
- **Server-action (on demand):** member detail (on row open), promotion send/cancel + approval decisions (on button click). The decrypted ID + grouped questionnaire only ever cross as the flat `PresentedMember`.
- **Client-derived (no fetch):** filtered rows + chip active state — pure reductions over the already-shipped `rows` via `matchesRosterQuery`/`matchesChip`/`matchesTeam`.

### E2E_TEST_MODE seam

`users.ts` (`decideUserApproval`, `hasCampAccess`, `isApproved`) already routes
through `testStore` under `E2E_TEST_MODE` (`users.ts:30,58`). The NEW
`apps/web/lib/promotion.ts` facade must mirror that split (`import "server-only"`,
real DB vs `testStore`) so `sendCaptainPromotionAction` / `getOpenPromotionRequest`
work under E2E without a live `captain_promotion_requests` table. Note (service-layer
05 §current state): under `E2E_TEST_MODE` the real-DB roster/team-membership helpers
have reduced behaviour today — the test store has no team concept — so handle/team
filtering acceptance is best asserted with the real-DB backend or extended test-store
fixtures.

---

## Gating

**Gate level:** authed + camp-active + approved + **captain** (preview-but-locked for
non-captains; decision #3). This is the headline gating surface alongside captain
tools/announcements.

- **Upstream redirects (KEEP, page-level):** not-authed → `getAuthenticatedUserOrRedirect`; `!hasCampAccess` → `/signup/required`; `!isApproved` → `/pending-approval` (`page.tsx:20-27`). A *viewing* captain who is themselves unapproved is bounced here.
- **Preview-but-locked (non-captain viewer) — NOT a redirect:** the page renders chrome/structure and returns **zero rows** (`isCaptain ? rows : []`, already implemented `page.tsx:31-33`). The redesign:
  - Mounts the shared `<CaptainLock skin="console" title="Captains only" body="Camp management is visible to captains. Your rank doesn't include it." />` (treatment copy "VIEW ONLY · no data for your rank" via the console skin eyebrow). **DELETE** the bespoke `opacity-40 blur-[2px]` + `bg-background/95` overlay + the dropped `MemberReadOnly`/`RedactedID`/`LockedActions` (decision #2).
  - Renders the toolbar **inert and visible** (FIX the live `{!locked}` hide bug, toolbar plan §States) — all `FilterChip`s `disabled`, search `disabled readOnly`, team popover never opens, counts read 0.
  - `RosterTable`/`RosterList` render structure (header + `CaptainLock` + empty/inert body); **no `RosterRow` instances mount** (zero data).
  - `MemberProfile`, `AssignCaptainDialog`, `RejectConfirmDialog` are **NOT mounted** in the locked branch (no row to select; `{!locked && …}` guard, mirroring the live `{!locked && <MemberModal/>}`).
  - **No data leak:** dimming a populated render is non-conformant (`flows.md` §3.3 invariant #2); the server withholds rows, so there is nothing to dim.
- **Server re-gate on every action:** `requireCaptain()` re-checks `rank === "captain"` on `getMemberDetailAction`, `decideApprovalAction`, `sendCaptainPromotionAction`, `cancelCaptainPromotionAction`. The client `locked`/`canAssignCaptain` flags are UX convenience, never the security boundary.
- **Self-guards (server-enforced):** a captain cannot approve/reject (`actions.ts:85`) or promote their own account (`core.canSendPromotion` target≠viewer).
- **Two-sided promotion non-bypassable:** sending never flips rank; only the target's accept (on the acceptance surface) does, via an explicit `setUserRank` call there.
- **PII gate (⛔ blocking, OQ#1):** plaintext member email is omitted/masked in `presentMemberDetail` until the data owner records a mitigation. The decrypted government ID stays captain-gated + masked (`CodeDisplay redacted`) — fine to ship.

---

## States

Surface-level matrix (`surfaces/14-roster.md` §States) mapped to this app wiring:

| State | Where handled | Behaviour |
|---|---|---|
| **Empty — no members** | `RosterTable`/`RosterList` | "No members have signed up yet." (zero rows). Stats read 0; chips read 0. |
| **Empty — filtered to zero** | wrappers | "No members match your search." / "Nobody is awaiting approval." (per active chip). Toolbar reflects the active query/chip. |
| **Empty — profile sub-regions** | `MemberProfile` | no answered questions → "No questionnaire answers on record yet."; empty grid → "Nothing recorded."; missing field → board placeholder e.g. dietary "Not provided yet — we'll show it here once {name} adds it". |
| **Loading — member detail** | `MemberProfile` | head painted from `row` instantly; body `Spinner` + summary "Loading…". Stale fetch on rapid row switch discarded (`cancelled` flag — KEEP from `MemberModal` L326-343). |
| **Loading — roster** | n/a | rows arrive server-rendered with the page (`force-dynamic`); no client list spinner. |
| **Populated** | wrappers + `MemberProfile` | rows + stats; on open, profile loads (head + grouped sections + redacted ID + actions). |
| **Error — action** | `MemberProfile` / dialog footers | `Alert role="alert"` ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in." / a transition reject). |
| **Error — detail fetch** | `MemberProfile` | body "Member not found." |
| **Submitting** | `MemberProfile` / dialogs | in-flight button → `Spinner`, all action buttons disabled during `useTransition`; scrim/Esc close suppressed mid-send. |
| **Success — decision** | `MemberProfile` | optimistic local flip of `approvalStatus` → Approve/Reject disappear; `revalidatePath` (server) + `router.refresh()` (client) → status Badge + stats + chip counts refresh. |
| **Success — assign send** | `AssignCaptainDialog` | optimistic `nextPromotionStatus("none","send")="sent"` → step 1 "Done"/step 2 "Pending"; `revalidatePath` reconciles; dialog may stay open or close (rank unchanged). |
| **Disabled** | toolbar / row / dialogs | locked → controls inert; (optional Ping placeholder permanently disabled if carried). |
| **Gating — preview-but-locked** | page + island | the headline state: chrome renders, zero rows, controls inert, `CaptainLock`, profile/dialogs not mounted (see §Gating). |
| **Gating — assign request states** | `AssignCaptainDialog` | `sent`/`accepted`/`declined`/`cancelled` reflected in the step tracker + (on re-open) informational copy; role badge flips to captain only after acceptance (acceptance surface). |
| **NOT applicable** | — | onboarding-incomplete gate (the gate spine runs before this page); offline/sync; budget/over-target. |

---

## Build steps — ordered, with prerequisites + acceptance + tests

> Sequencing honours MEMORY (green-CI-is-done): each step is an independently
> CI-green change; the migration and the questionnaire-catalogue-touching moves land
> alone. Many leaves are shared and built in their own component-plan passes; this
> ordering is the **app-integration** view (what must land in *this* route, in order).

**Phase prerequisites (must land before app wiring — architecture Phases 0–5):**
- **P0 Foundations:** status tokens (`success`/`warning`/`info`), `--overlay`, radius scale, `--font-mono`/type steps + `next/font` (gates Badge/StatTile/FilterChip/CaptainLock/Avatar/CodeDisplay).
- **P1/P2 Packages:** migration `0012` + `captain-promotion.ts` + `roster.handle` (db); `promotion.ts` types; `promotion.ts` core guards/state-machine; `initialsFrom`/`avatarTintFor` (core).
- **P5 Leaves:** `CaptainLock`, `Badge`, `Avatar` (mono-tinted), `CodeDisplay` (redacted), `IconBadge`, `Alert`, `Spinner`, `Divider`.

### Step 1 — EXTEND the pure view-models (`apps/web/lib/camp-roster.ts`)
Add `RosterRow.handle` (carry in `toRosterRow`); add `deriveRosterStats`,
`matchesRosterQuery` (name/handle/email/country/team), `matchesChip`/`matchesTeam`,
`statusToneFor(status)`.
- **Prereq:** `roster.handle` EXTEND (db). **AC:** counts reconcile (Members=all; Approved=`approvalStatus==='approved'`; Incomplete/Outstanding=`pendingRequiredActions>0`; Pending=`approvalStatus==='pending'`; Captains=`rank==='captain'`); search matches across all five fields; `statusToneFor` total over `RosterStatus`. **Test:** EXTEND `apps/web/lib/__tests__/camp-roster.test.ts` — handle/no-handle, each count, each predicate, an explicit counts-reconcile-with-filtered-rows assertion.

### Step 2 — EXTEND the presenter + detail action (`member-detail.ts` + `actions.ts`)
Add `handle`/`bio`/`teams[]`/`statusTag`/`canAssignCaptain`/`promotionStep` to
`PresentedMember`; build them in `presentMemberDetail`. EXTEND `getMemberDetailAction`
to call `getOpenPromotionRequest` → `promotionStepState`. Email field gated (OQ#1).
- **Prereq:** `promotion.ts` core (`promotionStepState`/`canSendPromotion`); `captain-promotion.ts` (`getOpenPromotionRequest`); `lib/promotion.ts` facade (wraps `getOpenPromotionRequest` with E2E split). **AC:** action returns the new fields; rank unchanged; self/already-captain target → `canAssignCaptain=false`. **Test:** EXTEND `member-detail.test.ts` (jsdom) — team badges built, self → false, already-captain → false.

### Step 3 — NEW promotion actions + facade
Create `apps/web/lib/promotion.ts` (`server-only`, real-vs-test split mirroring
`users.ts`). Add `sendCaptainPromotionAction` + `cancelCaptainPromotionAction` to
`actions.ts`.
- **Prereq:** Steps 1–2 packages. **AC:** non-captain → "Captain access only."; self/already-captain re-rejected server-side; send creates exactly one `sent` row (idempotent), **rank UNCHANGED**; cancel only on an in-flight `sent` row. **Test:** action-level (mock auth+db / E2E test store) — no rank flip on send; second send reuses the open row; `E2E_TEST_MODE` path exercised.

### Step 4 — `StatTile` + stats strip in `page.tsx`
Create `stat-tile.tsx`; derive `membersCount`/`approvedCount`/`incompleteCount`
(via `deriveRosterStats`) in `page.tsx`; render the three-tile strip (terminal vs
compact responsive) above the toolbar; update back-affordance copy to "Camp tools".
- **Prereq:** P0 tokens; Step 1. **AC:** strip renders above the toolbar; counts match roster; MEMBERS `$foreground`, APPROVED `$success`, INCOMPLETE `$warning`. **Test:** `stat-tile.test.tsx` (RTL) + a `page.tsx` count-derivation assertion.

### Step 5 — `FilterChip` + `RosterToolbar` (extract the inline block)
Create `filter-chip.tsx` + `roster-toolbar.tsx`. In `camp-management-roster.tsx`,
replace `Filter="all"｜"awaiting"` with `RosterChip` + `teamFilter: Team｜null`;
replace `awaitingCount` with `deriveRosterStats(rows)`; extend `filtered` to
`matchesRosterQuery && matchesChip && matchesTeam`. Mount `<RosterToolbar>`
**unconditionally** (inert when locked — fixes the `{!locked}` hide bug); delete the
inline filter/search block (`:112-157`) + the `Search` import + the off-token chips.
- **Prereq:** P0 tokens; Steps 1; `Input`/`Popover`/`Command` (REUSE). **AC:** five chips + console search; Outstanding warning-tone; team dropdown narrows rows; locked → toolbar visible + inert (not hidden), counts 0; no off-token hex. **Test:** `filter-chip.test.tsx` + `roster-toolbar.test.tsx` (RTL) per their plans incl. the locked-inert + counts-reconcile cases.

### Step 6 — `RosterRow` + `RosterTable`/`RosterList` (replace the inline table)
Create `roster-row.tsx`, `roster-table.tsx`, `roster-list.tsx`. In
`camp-management-roster.tsx`, replace the inline `<table>` (`:166-275`) with the
responsive pair; DELETE `STATUS_STYLE` (`:43-49`), `YesNo` (`:58-71`),
`PlaceholderRows` (`:527-541`), and the bespoke locked overlay (`:159-164,278-289`)
in favour of `<CaptainLock skin="console">`. Precompute `tint`/`initials`/`statusTone`
per row; pass `selected = selectedId === member.id`.
- **Prereq:** P0 tokens; `Avatar` (mono-tinted), `Badge`, `CaptainLock`; Step 1 (`statusToneFor`, `handle`). **AC:** board row anatomy at both breakpoints; all three ranks (🐱/🦩/🪄) render; empty/filtered-empty copy correct; locked → `CaptainLock` + no rows (no blur/redirect); selecting a row opens `MemberProfile`. **Test:** `roster-row.test.tsx` (select fires id on click + Enter/Space; locked inert; rank cases) + wrapper tests (empty/filtered/locked branches).

### Step 7 — `MemberProfile` (extract from `MemberModal`, inline panel)
Create `member-profile.tsx`: move the fetch/`useEffect`/stale-guard/`decide()`/
`useTransition` logic verbatim; **drop the `Dialog` shell** → inline expanding panel;
collapse Overview/Profile tabs into one scroll (OQ#6). Build ProfileHead (Avatar +
name + @handle + TeamBadges + status/rank Badges), bio, ProfileFieldGrid (redacted ID
via `CodeDisplay`), Actions footer (`Divider` + `Alert` + tokenised Buttons; Approve
direct, Reject → opens confirm, Assign → opens dialog when `canAssignCaptain`). Replace
raw `bg-emerald-600`/`Loader2` with token Button/`Spinner`. Mount only `{!locked}`.
- **Prereq:** Steps 2–3; `Avatar`/`Badge`/`CodeDisplay`/`Divider`/`Spinner`/`Alert`. **AC:** inline (not modal); rapid switches show no stale data; raw ID absent from DOM (bullets only); Approve/Reject only while pending; Assign hidden for self/already-captain/non-captain; PII email absent (OQ#1). **Test:** RTL — open→loading→populated; switch mid-flight → latest only; `queryByText(rawId)` null; pending shows Approve+Reject, approved hides them, self hides all three.

### Step 8 — `RejectConfirmDialog` + wire reject
Create `reject-confirm-dialog.tsx`. Change `MemberProfile`'s Reject from
`decide("rejected")` direct → opening this dialog; on confirm call
`decideApprovalAction(id, "rejected")` (REUSE) with the existing optimistic flip +
`router.refresh()`. Approve stays one-click. Mount only `{!locked}` + while pending.
- **Prereq:** Step 7; `IconBadge`/`Alert`/`Spinner` (REUSE Dialog/Button/action). **AC:** Reject opens confirm (no undo); Keep-pending = no-op; on confirm → status→Rejected + counts refresh; dismiss suppressed mid-send. **Test:** `reject-confirm-dialog.test.tsx` per plan.

### Step 9 — `AssignCaptainDialog` + `OptInStepTracker` + wire assign
Create `assign-captain-dialog.tsx` (+ co-located `OptInStepTracker`). Add the "Assign
captain rank" affordance (`shield`, `$secondary`) to `MemberProfile`'s footer, shown
only when `member.canAssignCaptain`. Wire Send → `sendCaptainPromotionAction`
(optimistic step flip via `nextPromotionStatus`); Cancel → `cancelCaptainPromotionAction`.
Mount only `{!locked}` + gated on `canAssignCaptain`.
- **Prereq:** Steps 2–3,7; `IconBadge`/`Alert`/`Spinner`; `promotion.ts` core + actions. **AC:** affordance hidden for self/already-captain/non-captain; Send disabled+Spinner while pending, **rank UNCHANGED**; second send no-op; terminal states show informational copy; dialog never mounts when locked. **Test:** `assign-captain-dialog.test.tsx` per plan (rank-flip assertion belongs to the action test, not here).

### Step 10 — Token + a11y + dead-code sweep on `camp-management-roster.tsx`
Confirm `STATUS_STYLE`/`YesNo`/`PlaceholderRows`/`MemberModal`/`Filter` union are
gone; `grep -E "bg-(emerald|amber|sky|rose)-|bg-background/95"` in the route folder →
empty; toolbar is `role="group"`; rows keyboard-activatable; action errors in live
regions.
- **AC:** lint clean; no off-token tints in the route folder; no redirect/blur in the locked path. **Test:** route-folder grep + lint in CI.

### E2E / test notes
- **E2E_TEST_MODE seam:** `lib/promotion.ts` must support the test-store backend (Step 3) so promotion send/cancel + open-request lookup work under `E2E_TEST_MODE` (mirror `users.ts`/`notifications.ts`). Roster/team helpers have reduced behaviour under the current test store (no team concept) — assert handle/team filtering against real-DB or extended fixtures.
- **Migration smoke** (service-layer 05 step 1): `0012` applies forward on fresh + populated DB; a second `sent` insert for the same target violates the partial unique index.
- **Action tests** (no rank flip on send; idempotent send; self/non-captain rejection; reject terminal + audit stamp) live with the actions, not the dialog suites.
- **Counts-reconcile** is asserted at the `camp-roster` unit level (Step 1) and the toolbar parent-integration level (Step 5).

---

## Open items — surface-specific decisions (cross-ref `open-questions.md`)

| OQ (surface 14) | open-questions.md | Owner | Status / impact on this surface |
|---|---|---|---|
| **OQ#1 — Member email plaintext (PII)** ⛔ | C1 | product (data owner) | **BLOCKING for the email field only.** `presentMemberDetail` omits/masks email until a mitigation (redact / reveal-gate / accept) is recorded. The rest of roster ships. Do not silently ship plaintext email. |
| OQ#2 — `@handle` source/fallback | E29 | eng, product | Reuse `users.telegramHandle`; confirm fallback when null (slug from name vs show nothing). No new column. Gates the @handle sub-line + search-by-handle. |
| OQ#3 — Promotion acceptance surface | D3 | product, design | Where the *target* accepts/decline (home rank-section / notifications) needs speccing. This surface only sends/cancels; acceptance actions are out of this folder. |
| OQ#4 — Promotion vs invite-code rank | D4 | product | Confirm double-opt-in is the only in-app promotion path; code-minted captains bypass intentionally (`setUserRank` stays for invite minting). |
| OQ#5 — Stat/chip semantics | D33 | product | Confirm INCOMPLETE == Outstanding (set: `pendingRequiredActions>0`) and Pending == approval queue, so counts don't double-claim. Plan assumes this mapping in `deriveRosterStats`. |
| OQ#6 — Inline profile field coverage | D34 | product, design | Confirm board subset vs full grouped questionnaire, and tabs→one-scroll. Plan keeps the full grouped profile, board fields as priority overview, tabs collapsed. |
| OQ#7 — INCOMPLETE numeral token (mobile) | B9 | design | Mobile `$accent` vs terminal `$primary`/warning → reconcile to `$warning` (StatTile `tone="warning"`). Plan adopts `$warning`. |
| OQ#8 — Demote / revoke captain | D5 | product | Out of scope; boards only assign. Flag if product wants a demote path. |
| (carry) Captain colour identity / RankPill token | B6, B8 | design | `$accent` for captain/match; `#ff008c2e` → semantic token. Affects Badge/CaptainLock tints. |
| (carry) Profile rank-tag asymmetry | — (decision carry, spec §4) | design | Roster row distinguishes all three ranks (🐱/🦩/🪄); profile rank tag is Captain/Member only — documented asymmetry, not fixed. |
| (forward note) No realtime push on approval | E11 | eng | Approved member sees nothing until reload; future push/SSE. Not in scope. |
| (forward note) Rejected re-applying a code | D14 | product | A previously-rejected member can reappear `pending` via a new requires-approval code — captains may see them again. Not a build blocker here. |

WROTE design/spec/impl/app/14-roster.md
