# AssignCaptainDialog — organism plan

- **mapsTo + home:** **NEW** (app-local) over `@camp404/ui/dialog.tsx` (per
  `component-library.md` §AssignCaptainDialog: "NEW (app-local) over
  `@camp404/ui/dialog.tsx`"). It is roster-specific (single consumer), drives **the
  one schema change** (decision #4), and is `"use client"` + composes server
  actions — so it **lives in `apps/web`**, not `@camp404/ui` (the package may not
  import `next/*` or server actions; architecture.md layering `types ← {db,core} ←
  ui ← apps`). It REUSES the package `Dialog` primitive (and `Button`) underneath.
- **Target file:** `apps/web/app/captains/camp-management/assign-captain-dialog.tsx`
  (`"use client"`), with the NEW sub-component `OptInStepTracker` co-located in the
  same file (board calls it a sub-component; it has no separate plan file and one
  consumer). Mounted by `camp-management-roster.tsx` (the roster client).

---

## Current state — what exists today (the old design's component/route markup)

**The assign-captain flow does NOT exist today.** This is a genuinely new
organism backed by the redesign's only schema change. Confirmed:

- `grep -rn -i "assign.captain|AssignCaptain|promotion|Make.*captain|captain rank"
  apps/web/app/captains/camp-management/` → **zero hits**. There is no promotion
  markup, no dialog, no step tracker, no `captain_promotion_requests` consumer in
  the codebase.
- `apps/web/app/captains/camp-management/camp-management-roster.tsx` (541 lines) —
  the live roster client. Its per-member detail dialog (`MemberModal`, lines
  308–502) renders **only** Approve/Reject (`decide("approved"|"rejected")`, lines
  345–366, 461–487) and a permanently-disabled "Ping" placeholder (lines 488–496).
  **There is no "Assign captain rank" action and no second dialog.** The rank
  badge in the table (lines 225–238) and the live profile rank tag are
  presentation-only; rank is changed today only via invite-code minting
  (`users.ts setUserRank` / `assigned_rank`, service-plan 05 §DELETE note).
- `apps/web/app/captains/camp-management/actions.ts` (97 lines) — the `"use
  server"` actions: `requireCaptain()` (lines 30–43, re-checks `rank === "captain"`
  on every call), `getMemberDetailAction` (lines 46–68), `decideApprovalAction`
  (lines 75–96, with decision-whitelist + self-guard `userId === gate.captainId`).
  **No promotion action exists.**
- `packages/ui/src/components/dialog.tsx` (158 lines) — the REUSE Radix-`Dialog`
  primitive: `Dialog` / `DialogContent` (overlay `bg-background/80`, centred,
  `max-w-lg`, `XIcon` close) / `DialogHeader` / `DialogTitle` / `DialogDescription`
  / `DialogFooter` / `DialogClose`. This is the frame AssignCaptainDialog builds on.
- The roster's locked overlay (lines 278–289) is the inline `CaptainLock` hand-roll
  being PROMOTED (molecule-captainlock plan); when `locked`, `MemberModal` is **not
  mounted** at all (lines 291–296 `{!locked && <MemberModal .../>}`) — the same
  preview-but-locked rule applies to AssignCaptainDialog (it is never mounted in the
  locked branch).

**Net:** the dialog frame (`@camp404/ui/dialog.tsx`), the `Button` atom, and the
`requireCaptain` gate exist and are REUSE. Everything else — the dialog body, the
two-step tracker, the send/cancel actions, the `captain_promotion_requests`
table/types/core-guards, and the affordance that opens it — is NEW.

Boards: desktop `S17 Roster — Iteration B (terminal console)` (board #37) §6
"Assign-captain double opt-in dialog"; mobile board #38 (`AssignCaptainModal`).
Brief: `design/spec/surfaces/14-roster.md` §6.

---

## Composition — leaves, core helpers, services; server/client split

### `"use client"` — this whole organism is client-side.
It owns dialog open/close state, the in-flight `useTransition`, and the optimistic
step-state flip. It calls server actions; it does **not** fetch on its own (it
receives `requestState` from the parent, which got it from `getMemberDetailAction`).

### Leaf components it consumes (link plan files)
| Leaf | Plan | Role here |
|---|---|---|
| `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` | (REUSE `@camp404/ui/dialog.tsx`, no leaf plan — package primitive) | Modal frame, scrim, `Esc`/scrim/`X` close, focus trap. `DialogContent` carries the `$secondary`-stroke console skin via `className`. |
| `Button` | [atom-button.md](atom-button.md) | `variant="outline"` Cancel + `variant="default"` "Send request" (primary). Loading is **consumer-owned**: `disabled={isPending}` + `<Spinner>` swapped into children (atom-button §States, item 6). |
| `IconBadge` | [atom-iconbadge.md](atom-iconbadge.md) | Title-bar `shield-plus` mark, `tone="secondary"` (the captain-rank tone, atom-iconbadge §Variants `bg-secondary/25`), `size="sm" shape="rounded"`. Matches board §6 "window-chrome title bar (`shield-plus` 'Assign captain')". |
| `Spinner` | [atom-spinner.md](atom-spinner.md) | Swapped into the "Send request" Button children while `isPending`. |
| `Alert` | [molecule-alert.md](molecule-alert.md) | The error state (`tone="destructive"`, `role="alert"`) when a send fails — replaces a bare `<p className="text-destructive">`. |
| **`OptInStepTracker`** (NEW sub-component) | *this file* (no separate plan) | The two-step "you send → they accept" indicator. See below. |

### `OptInStepTracker` — NEW sub-component (defined in this file)
Two-step indicator (board §6: step 1 "You send the request", step 2 "They accept
in their app"). Pure presentational; props `{ sent: boolean; accepted: boolean }`.

- Step 1: `circle-check` (`lucide`) + "Done" once `sent`, else `circle` + "Pending".
- Step 2: `circle-check` + "Done" once `accepted`, else `circle` + "Pending".
- Desktop terminal skin shows live step state inline; mobile shows numbered 1/2.
- Completed-step tint uses the **`success` status token** (atom-iconbadge §tone
  `success` → `bg-success/15`) — which **gates on the NEW `success`/`warning`/`info`
  status tokens landing in `globals.css`** (foundations-tokens / architecture
  Phase 0; component-library §Notes "NEW status tokens must land before…").
- Driven by `core.promotionStepState(request)` mapped from `requestState` (below).

### `@camp404/core` helpers (pure — `packages/core/src/promotion.ts`, NEW · plan 05)
The dialog itself stays presentational, but its enable/disable + step rendering are
computed from the pure promotion state machine so the rules can't drift from the
server:
- `promotionStepState(request | null) → { sent, accepted }` — feeds
  `OptInStepTracker`.
- `canSendPromotion({viewerRank, viewerId, targetRank, targetId})` — the **client
  mirror** of the visibility/enable guard (captain && target-not-captain && not
  self). The authoritative check is re-run server-side in the action; the client
  call only gates the affordance + Send button so a hidden/invalid send can't be
  initiated from the UI.
- `nextPromotionStatus(current, action)` — used by the parent to predict the
  optimistic next state for the tracker after a successful send/cancel.

### Services / server-actions it calls (named from service-plan 05)
| Action | File | Marking | Contract |
|---|---|---|---|
| `sendCaptainPromotionAction(targetUserId)` | `apps/web/app/captains/camp-management/actions.ts` | **NEW** | `requireCaptain` → `core.canSendPromotion` → `db.sendPromotionRequest` (idempotent via the partial unique index) → `revalidatePath("/captains/camp-management")`. Returns `{ok} \| {ok:false,error}`. **Never flips rank.** |
| `cancelCaptainPromotionAction(requestId)` | `apps/web/app/captains/camp-management/actions.ts` (or near home/notifications) | **NEW** | requester withdraws an in-flight `sent` request → `core.canDecidePromotion` (cancel only by `requestedBy`, only from `sent`) → `db.decidePromotionRequest("cancelled")`. From the roster dialog. |
| (read) open-request step state | via `getMemberDetailAction` **EXTEND** | **EXTEND** | detail action calls `db.getOpenPromotionRequest(targetUserId)` → `core.promotionStepState` → exposes `promotionStep` + `canAssignCaptain` on the `PresentedMember` view-model (member-detail plan 05). The dialog **receives** this; it does not fetch it. |

Underlying data-access (`packages/db/src/captain-promotion.ts`, NEW · plan 05):
`sendPromotionRequest`, `getOpenPromotionRequest`, `decidePromotionRequest`,
`listIncomingPromotionRequests`. **Acceptance** (`acceptCaptainPromotionAction` →
`setUserRank(target,"captain")`) is NOT called by this organism — that is the
**target's** acceptance surface (home rank-section / notifications), not the roster.

### Server-component vs client split
- **Server:** `page.tsx` gates (auth → camp-access → approved → captain?) and passes
  `rows` (`isCaptain ? roster.map(toRosterRow) : []`). The `promotionStep` +
  `canAssignCaptain` come from the server action (`getMemberDetailAction`).
- **Client (this organism + `MemberProfile` parent + roster):** all dialog state,
  `useTransition`, optimistic flip, and the action calls.

---

## API & data flow — props/inputs, fetch vs receive, state flow

```ts
type PromotionRequestState =
  | { status: "none" }                                   // no open request
  | { status: "sent"; requestId: string }                // in-flight, awaiting target
  | { status: "accepted" | "declined" | "cancelled" };   // terminal (display)

interface AssignCaptainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target member (from the selected roster row / member detail). */
  target: { id: string; displayName: string; rank: "captain" | "member" };
  /** Current promotion request state, sourced from getMemberDetailAction. */
  requestState: PromotionRequestState;
  /** Returns the action result so the parent can flip optimistic step state. */
  onSend: (targetUserId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Cancel an in-flight (sent) request. Optional — omit to hide Cancel-request. */
  onCancel?: (requestId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}
```

- **Receives (does not fetch):** `target`, `requestState` (from
  `getMemberDetailAction` via the parent `MemberProfile`/roster), and the `onSend`/
  `onCancel` action wrappers. Keeping fetch out of the dialog avoids a stale fetch
  on rapid row switches (the parent already discards stale detail responses —
  roster lines 326–343).
- **Step state** is derived: `core.promotionStepState({ status })` →
  `{ sent, accepted }` → `OptInStepTracker`. `none`→both false; `sent`→sent true,
  accepted false; `accepted`→both true.
- **No form fields, no free text** — it is a confirm-with-handshake dialog, not an
  input form. The only "validation" is the visibility/transition guard
  (`canSendPromotion` client-side, re-checked in the action).
- **Flow:** open (from the `MemberProfile` "Assign captain rank" affordance) →
  render heading "Make {name} a captain?" + copy + `OptInStepTracker` + Cancel/Send
  → click **Send request** → `startTransition` → `onSend(target.id)` →
  - ok → parent flips local `requestState` to `{status:"sent"}` (optimistic, via
    `nextPromotionStatus("none","send")="sent"`), tracker step 1 → "Done", step 2 →
    "Pending"; `revalidatePath` + `router.refresh()` reconcile server truth. The
    dialog may stay open (showing the new in-flight state) or close — board §6 says
    "dialog can close with the request now in-flight".
  - error → `Alert` in the dialog body; buttons re-enabled.
- **Idempotency:** a second send for a target with an open `sent` row reuses the row
  (DB partial unique index `WHERE status='sent'`); no duplicate, no rank change.

---

## States — full matrix incl. global gating

| State | Trigger | Rendering |
|---|---|---|
| **Hidden / not mounted** | `locked` (non-captain) **or** `canAssignCaptain === false` (target already captain / self / viewer not captain) | The opening affordance is **absent** and the dialog is **never mounted**. Per preview-but-locked (decision #3) the whole roster client withholds it in the locked branch — same rule as the live `{!locked && <MemberModal/>}` guard. |
| **Idle** (closed) | default | Nothing rendered; affordance visible in `MemberProfile` footer. |
| **Open · no request** (`requestState.status==="none"`) | affordance click | Heading "Make {name} a captain?" + two-sided copy + `OptInStepTracker` (both Pending) + Cancel + enabled **Send request**. |
| **Submitting / sending** | Send clicked, `isPending` | "Send request" → `disabled` + `<Spinner>` + "Sending…"; Cancel disabled; scrim/Esc close suppressed mid-flight. |
| **Sent (success)** (`status==="sent"`) | action ok | Step 1 "Done" (`circle-check`, `success` tone), step 2 "Pending"; Send hidden/replaced by **Cancel request** (if `onCancel`); copy reminds rank flips only on target accept. (Idempotent re-open shows this same state.) |
| **Accepted** (`status==="accepted"`) | server truth on re-open | Both steps "Done"; informational ("They accepted — they're a captain now"); no Send. Terminal. |
| **Declined / Cancelled** (terminal) | server truth on re-open | Step 2 shows declined/cancelled; informational copy; offer to **Send again** (a fresh `none`→send) since the open-row is closed. |
| **Error** | action returns `{ok:false}` | `Alert tone="destructive" role="alert"` in body with the action's message ("Captain access only." / "Your account isn't camp-active yet." / "Not signed in." / a transition reject); buttons re-enabled; no rank change. |
| **Disabled** | `isPending` or terminal | Relevant buttons inert. |
| **Empty / loading** | n/a here | The dialog has no internal fetch; the **parent** profile shows the loading spinner before the affordance + `requestState` resolve. If opened before resolution (shouldn't happen — affordance gated on `canAssignCaptain`), render Send disabled. |
| **Preview-but-locked** | non-captain viewer | Covered by **Hidden/not mounted** above — the headline gating state for this captain/rank surface. NOT a redirect, NOT an overlay over a populated dialog; the dialog simply does not exist for non-captains and the server sends zero rows (flows.md §3.3 invariant #2: dimming a populated render is a data leak). |

Cross-state invariants (service-plan 05 §Validation): self-promotion blocked
(re-checked server-side); two-sided is non-bypassable (send never flips rank);
in-flight sends idempotent; cancel/decline terminal and never flip rank;
double-accept is a no-op (acceptance side).

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Hard prerequisites that must land first (service-plan 05 / architecture phases):**
1. **Phase 0 — status tokens** (`success`/`warning`/`info` in `globals.css`) — gates
   `OptInStepTracker`'s "Done" tint and the `IconBadge tone="secondary/success"`.
2. **Migration 0012** — `captain_promotion_requests` table + `promotion_request_status`
   enum (architecture §"The one schema change"; plan 05 step 1).
3. **`@camp404/types/promotion.ts`** — `PromotionRequestStatus`,
   `IncomingPromotionRequest` (plan 05 step 2).
4. **`@camp404/core/promotion.ts`** — `canSendPromotion`, `canDecidePromotion`,
   `nextPromotionStatus`, `promotionStepState` (plan 05 step 3).
5. **`@camp404/db/captain-promotion.ts`** — `sendPromotionRequest`,
   `getOpenPromotionRequest`, `decidePromotionRequest` (plan 05 step 4).
6. **Actions** — `sendCaptainPromotionAction` + `cancelCaptainPromotionAction`;
   `getMemberDetailAction` EXTENDed to expose `promotionStep` + `canAssignCaptain`
   (plan 05 steps 7–8).
7. **Leaf primitives** — `Button` (REUSE, atom-button), `IconBadge` (PROMOTE,
   atom-iconbadge), `Spinner` (atom-spinner), `Alert` (PROMOTE, molecule-alert),
   `Dialog` (REUSE). `CaptainLock` (molecule-captainlock) for the locked branch is a
   sibling, not a dependency of this dialog.

**Steps**
1. **Build `OptInStepTracker`** (sub-component, this file). Props `{sent,accepted}`;
   two rows (`circle-check`/`circle` + "Done"/"Pending"); desktop inline / mobile
   numbered. *AC:* `{false,false}`→both Pending; `{true,false}`→1 Done/2 Pending;
   `{true,true}`→both Done; "Done" rows carry the `success` tint; no interactive
   elements. *Test:* RTL render of the three step states.
2. **Build `AssignCaptainDialog`** over `@camp404/ui/dialog.tsx`. Title-bar
   `IconBadge shield-plus tone="secondary"` + `DialogTitle "Assign captain"` + `X`
   close; body heading "Make {name} a captain?" + the two-sided copy + tracker;
   `DialogFooter` Cancel (`outline`) + Send (`default`). `$secondary` stroke on
   `DialogContent` (console skin) via `className`; mobile inline modal variant.
   *AC:* renders all states above; copy matches board §6; no raw hex.
3. **Wire send** — `startTransition(() => onSend(target.id))`; on ok the parent
   flips `requestState` optimistically (`nextPromotionStatus`); on error show
   `Alert`. *AC:* Send disabled + Spinner while pending; rank UNCHANGED on send
   (verify against the server action's `revalidatePath` not touching `users.rank`);
   error renders an alert and re-enables.
4. **Wire cancel** (when `onCancel` + `status==="sent"`) — `cancelCaptainPromotionAction(requestId)`;
   on ok flip to `cancelled`. *AC:* cancel only available on an in-flight `sent`
   request; never flips rank.
5. **Mount in the parent** — EXTEND `camp-management-roster.tsx`'s `MemberProfile`
   footer: add the **"Assign captain rank"** affordance (`$secondary`-tinted,
   `shield` icon) shown only when `member.canAssignCaptain` (board §5 "Shown only
   when the viewer is a captain and the target is not already a captain and not
   self"). Mount `<AssignCaptainDialog>` only in the `{!locked}` branch. Pass
   `requestState` from `member.promotionStep`. *AC:* affordance hidden for
   self/already-captain/non-captain; dialog never mounts when `locked`.
6. **Stories** (`assign-captain-dialog.stories.tsx`, co-located): `NoRequest`,
   `Submitting`, `Sent`, `Accepted`, `Declined`, `Error`, `MobileInline`. *AC:*
   render without console errors; `NoRequest` matches board §6.
7. **Tests** (`assign-captain-dialog.test.tsx`, co-located):
   - opens with heading "Make {name} a captain?" + both steps Pending;
   - Send fires `onSend(target.id)` once; disables + shows Spinner while pending;
   - on ok → step 1 Done / step 2 Pending;
   - on error → `Alert` shown, buttons re-enabled;
   - Cancel (when `sent`) fires `onCancel(requestId)`;
   - terminal states render informational copy + "Send again" where appropriate;
   - Esc/scrim close calls `onOpenChange(false)` (and is suppressed mid-send);
   - **gating:** with `canAssignCaptain=false` the affordance is absent and the
     dialog is not rendered (parent-level test in the roster).
   *AC:* all green; no rank-flip assertion belongs here (that's the action test in
   plan 05 step 7/8).

---

## Consumers — which surfaces mount it

| Consumer | File | How |
|---|---|---|
| **Roster / MemberProfile** (the only mount) | `apps/web/app/captains/camp-management/camp-management-roster.tsx` (the inline member profile footer) | The "Assign captain rank" affordance opens `<AssignCaptainDialog>`; mounted only in the `{!locked}` captain branch, gated on `member.canAssignCaptain`. |
| **Captain roster surface** (S17 Iteration B) | `surfaces/14-roster.md` §6 ("Assign-captain double opt-in dialog") | Desktop board #37 + mobile board #38 (`AssignCaptainModal`). |

**Not a consumer (the other side of the handshake):** the **target's** acceptance
lives on the home rank-section preview (`surfaces/06-home.md`) and/or the
notifications inbox (`surfaces/09-notifications.md`) via
`listIncomingPromotionRequests` + `acceptCaptainPromotionAction` /
`declineCaptainPromotionAction`. That is a separate affordance, not
AssignCaptainDialog (which is the captain-side **send/cancel** surface only).

WROTE design/spec/impl/components/organism-assigncaptaindialog.md
