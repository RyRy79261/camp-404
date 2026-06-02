# RejectConfirmDialog — organism plan

- **mapsTo + home:** **NEW** (app-local) over `@camp404/ui/dialog.tsx` (per
  `component-library.md` §RejectConfirmDialog: "NEW (app-local) over
  `@camp404/ui/dialog.tsx`. triangle-alert title + body + Keep-pending /
  Reject(destructive)"). It is roster-specific (single consumer), is `"use client"`,
  and composes a server action (`decideApprovalAction`) — so it **lives in
  `apps/web`**, not `@camp404/ui` (the package may not import `next/*` or server
  actions; architecture.md layering `types ← {db,core} ← ui ← apps`). It REUSES the
  package `Dialog` and `Button` primitives underneath. Sibling of
  [organism-assigncaptaindialog.md](organism-assigncaptaindialog.md) — same surface
  (§7 vs §6), same console-modal frame pattern, opposite tone (`$destructive` stroke
  vs `$secondary`).
- **Target file:** `apps/web/app/captains/camp-management/reject-confirm-dialog.tsx`
  (`"use client"`), mounted by `camp-management-roster.tsx` (the roster client),
  inside the inline `MemberProfile` Reject action path.

---

## Current state — what exists today (the old design's component/route markup)

**There is NO reject-confirmation step today.** The live roster rejects with a
single click — no double-confirm dialog exists. This organism is genuinely NEW.
Confirmed against the codebase:

- `apps/web/app/captains/camp-management/camp-management-roster.tsx` (541 lines) —
  the live roster client. Its per-member detail dialog (`MemberModal`, lines
  ~308–502) renders Approve/Reject **inline** in the footer. **Reject calls
  `decide("rejected")` directly with no confirmation** (`onClick={() =>
  decide("rejected")}`, lines ~468–470, inside a `variant="destructive" size="sm"`
  Button labelled `<X /> Reject`). `decide()` (lines ~345–366) runs
  `startTransition(async () => { const res = await decideApprovalAction(row.id,
  decision); … })`, sets `actionError` on failure, optimistically flips
  `approvalStatus` locally, then `router.refresh()`. The footer also has the
  permanently-disabled "Ping" placeholder (lines ~488–496). **No second dialog, no
  scrim, no "Keep pending" / "Reject application" copy, no `triangle-alert` mark.**
- `apps/web/app/captains/camp-management/actions.ts` — the `"use server"` actions.
  `requireCaptain()` re-checks `rank === "captain"` on every call;
  `decideApprovalAction(userId, decision)` (lines ~75–96) carries the **decision
  whitelist** (`approved`/`rejected` only), the **self-guard** (`userId ===
  gate.captainId` → "You can't decide on your own account."), the audit stamp (via
  `decideUserApproval` → `setUserApproval`), and `revalidatePath`. **This action
  already exists and is REUSE — RejectConfirmDialog adds a confirmation gate in
  front of the rejection branch; it does NOT change the action.**
- `packages/ui/src/components/dialog.tsx` (158 lines) — the REUSE Radix `Dialog`
  primitive: `Dialog` / `DialogContent` (overlay `bg-background/80`, centred,
  `max-w-lg`, `XIcon` close, focus trap) / `DialogHeader` / `DialogTitle` /
  `DialogDescription` / `DialogFooter` / `DialogClose`. The frame this builds on
  (exported via the `./components/*` glob → `@camp404/ui/components/dialog`).
- The roster's locked overlay (lines ~278–289) is the inline `CaptainLock` hand-roll
  being PROMOTED (molecule-captainlock plan); when `locked`, `MemberModal` is **not
  mounted** at all (`{!locked && <MemberModal .../>}`, lines ~291–296) — the same
  preview-but-locked rule applies here (RejectConfirmDialog is never mounted in the
  locked branch, because the whole profile/dialog tree it lives in is withheld).

**Net:** the dialog frame (`@camp404/ui/components/dialog`), the `Button` atom, the
`requireCaptain` gate, and `decideApprovalAction("rejected")` all exist and are
REUSE. What is NEW is the confirm-before-reject dialog itself — the
`triangle-alert` title bar, the "Reject {Name}'s application?" body, and the
`Keep pending` / `Reject` (destructive) action pair that gates the existing
rejection write. Per `surfaces/14-roster.md` §Divergences, the live one-click
reject is replaced by this confirm step.

Boards: desktop `S17 Roster — Iteration B (terminal console)` (board #37) §7
"Reject confirm dialog" (`RejectScrim`/`RejectConfirm`, 440px, `$destructive`
stroke); mobile board #38 (`RejectModal`). Brief: `surfaces/14-roster.md` §7.

---

## Composition — leaves, core helpers, services; server/client split

### `"use client"` — this whole organism is client-side.
It owns dialog open/close state and the in-flight `useTransition` for the reject
write. It calls one existing server action; it does **not** fetch on its own (the
`target` is passed in from the already-loaded member detail).

### Leaf components it consumes (link plan files)
| Leaf | Plan | Role here |
|---|---|---|
| `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` | REUSE `@camp404/ui/components/dialog` (package primitive, no leaf plan) | Modal frame, scrim, `Esc`/scrim/`X` close, focus trap. `DialogContent` carries the `$destructive`-stroke console skin via `className`. |
| `Button` | [atom-button.md](atom-button.md) | `variant="outline"` **Keep pending** + `variant="destructive"` **Reject** (the destructive-fill confirm — board §7 "`Reject`, `$destructive` fill"). Loading is **consumer-owned**: `disabled={isPending}` + `<Spinner>` swapped into the Reject children (atom-button §States, item 6). |
| `IconBadge` | [atom-iconbadge.md](atom-iconbadge.md) | Title-bar `triangle-alert` mark, `tone="destructive"` (atom-iconbadge §Variants `bg-destructive/12`), `size="sm" shape="rounded"`. Matches board §7 "Title bar `triangle-alert` 'Reject application'". |
| `Spinner` | [atom-spinner.md](atom-spinner.md) | Swapped into the **Reject** Button children while `isPending`. |
| `Alert` | [molecule-alert.md](molecule-alert.md) | The error state (`tone="destructive"`, `role="alert"`) when the rejection write fails — replaces the bare `<p className="text-destructive">` the live footer uses. |

No `OptInStepTracker` / step tracker (that is the sibling AssignCaptainDialog only).
No form fields, no free text — this is a pure confirm dialog.

### `@camp404/core` helpers
**None.** RejectConfirmDialog has no business logic of its own — it is a
presentational confirmation in front of an existing, server-guarded write. The
*rules* that protect rejection (decision whitelist, self-guard, captain gate,
camp-active re-check) live in `decideApprovalAction` server-side (REUSE, plan 05).
There is no client-side guard to mirror for rejection: the affordance is only shown
while `approvalStatus === "pending"` (the parent's `isAwaiting` gate), and the
authoritative check is the server action. (Contrast the sibling
AssignCaptainDialog, which mirrors `core.canSendPromotion` — rejection needs no
such visibility predicate beyond the pending check.)

### Services / server-actions it calls (named from service-plan 05)
| Action | File | Marking | Contract |
|---|---|---|---|
| `decideApprovalAction(userId, "rejected")` | `apps/web/app/captains/camp-management/actions.ts` | **REUSE** | `requireCaptain` (rank re-check) → decision whitelist (`rejected` allowed) → self-guard (`userId === captainId` blocked) → `decideUserApproval` → `setUserApproval` (audit stamp: `approvalStatus="rejected"`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`) → `revalidatePath("/captains/camp-management")`. Returns `{ok} \| {ok:false,error}`. **Reject is terminal** (denied state) per surface §User-actions. |

Underlying data-access: `packages/db/src/burner-profile.ts` `setUserApproval`
(REUSE). No NEW data-access, no NEW types, no schema change — RejectConfirmDialog
touches none of the redesign's one migration (that is the promotion table, which
this dialog has nothing to do with).

### Server-component vs client split
- **Server:** `page.tsx` gates (auth → camp-access → approved → captain?) and passes
  `rows` (`isCaptain ? roster.map(toRosterRow) : []`); zero rows for non-captains.
  The `decideApprovalAction` is the `"use server"` action invoked from the client.
- **Client (this organism + `MemberProfile` parent + roster):** dialog open/close
  state, `useTransition`, the optimistic `approvalStatus` flip on success, and the
  action call.

---

## API & data flow — props/inputs, fetch vs receive, state flow

```ts
interface RejectConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target member (from the selected roster row / member detail). */
  target: { id: string; displayName: string };
  /**
   * Confirm the rejection. Returns the action result so the parent can
   * flip optimistic status + close on success. Wraps
   * decideApprovalAction(target.id, "rejected").
   */
  onReject: (targetUserId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Dismiss without rejecting (the "Keep pending" no-op). Optional — defaults to onOpenChange(false). */
  onKeepPending?: () => void;
}
```

Maps to `component-library.md` §RejectConfirmDialog **Props:** `target` ·
`onReject`/`onKeepPending`.

- **Receives (does not fetch):** `target` (the already-selected member), `onReject`
  (the action wrapper), and the open/close handlers. The dialog has **no internal
  fetch** — the parent already loaded the member detail; nothing async is needed to
  render the confirm copy.
- **No form fields, no free text** — it is a confirm dialog. There is no
  client-side validation; the only gate is "shown while `approvalStatus ===
  'pending'`" (enforced by the parent's `isAwaiting`), and the server action is the
  authority.
- **Flow** (replaces the live one-click reject):
  1. In the `MemberProfile` footer, while `approvalStatus === "pending"`, the
     **Reject** button (`variant="outline"`, board §5 "Reject (`Button-Outline`)")
     now **opens this dialog** instead of calling `decide("rejected")` directly.
  2. Dialog renders: `triangle-alert` IconBadge + title "Reject application" + body
     "Reject {Name}'s application?" + "They'll be told the application wasn't
     approved. This can't be undone here." (board §7 copy) + footer
     **Keep pending** (`outline`) + **Reject** (`destructive` fill).
  3. **Keep pending** (or `Esc`/scrim/`X`) → `onKeepPending?.()` then
     `onOpenChange(false)` → dismiss, **no change** (surface §User-actions: "on
     'Keep pending' → no-op").
  4. **Reject** → `startTransition(() => onReject(target.id))` →
     - ok → parent flips local `approvalStatus` to `"rejected"` optimistically (the
       Approve/Reject pair disappears, status pill + counts refresh via
       `revalidatePath` + `router.refresh()`), dialog closes.
     - error → `Alert` in the dialog body with the action's message; buttons
       re-enabled; dialog stays open.
- **Terminal & idempotent:** reject is terminal (denied state). Re-rejecting an
  already-rejected member is prevented by the parent (the affordance is gone once
  `approvalStatus !== "pending"`), and the server action's whitelist/state still
  guards it. The self-guard ("You can't decide on your own account.") is server-side
  — the affordance is also hidden for self upstream.

---

## States — full matrix incl. global gating

| State | Trigger | Rendering |
|---|---|---|
| **Hidden / not mounted** | `locked` (non-captain) **or** target not pending **or** self | The opening **Reject** affordance is **absent** (shown only while `approvalStatus === "pending"`, surface §5 "shown only while …pending"; self is bounced server-side) and the dialog is **never mounted**. Per preview-but-locked (decision #3) the whole roster client withholds the profile/dialog tree in the locked branch — same rule as the live `{!locked && <MemberModal/>}` guard. |
| **Idle** (closed) | default | Nothing rendered; the **Reject** affordance is visible in the `MemberProfile` footer (pending member, captain viewer). |
| **Open · confirm** | Reject affordance click | `triangle-alert` IconBadge (`tone="destructive"`) + title "Reject application" + body "Reject {Name}'s application?" + "They'll be told the application wasn't approved. This can't be undone here." + **Keep pending** (`outline`) + enabled **Reject** (`destructive` fill). The board's `RejectScrim` dims the page; `DialogContent` carries the `$destructive` stroke (440px console skin). |
| **Submitting** | Reject clicked, `isPending` | **Reject** → `disabled` + `<Spinner>` (loading swap in children, atom-button §States); **Keep pending** disabled; scrim/`Esc`/`X` close suppressed mid-flight (no dismiss while writing). |
| **Success** | action ok | Parent flips `approvalStatus = "rejected"` optimistically → Approve/Reject pair disappears, status pill → Rejected, stats + chip counts refresh (`revalidatePath` + `router.refresh()`); **dialog closes**. Terminal — no re-open path for the same member (affordance gone). |
| **Error / action-failure** | action returns `{ok:false}` | `Alert tone="destructive" role="alert"` in the dialog body with the action's message — one of "Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in." (surface §States validation-error list); buttons re-enabled; dialog stays open; **no status change**. |
| **Keep-pending (dismiss)** | Keep pending / `Esc` / scrim / `X` | `onKeepPending?.()` → `onOpenChange(false)`; **no-op**, member stays `pending` (surface §User-actions). |
| **Disabled** | `isPending` or locked | Relevant buttons inert (locked → not mounted at all). |
| **Empty / loading** | n/a here | The dialog has no internal fetch; the **parent** `MemberProfile` shows the loading spinner before the detail (and thus the Reject affordance) resolves. The dialog only mounts once a pending member is loaded. |
| **Preview-but-locked** | non-captain viewer | Covered by **Hidden/not mounted** — the headline gating state for this captain/rank surface. NOT a redirect, NOT an overlay over a populated dialog; the dialog simply does not exist for non-captains and the server sends zero rows (flows.md invariant: dimming a populated render is a data leak). |

Cross-state invariants (service-plan 05 §Validation, all **server-enforced** in
`decideApprovalAction`, the dialog only gates the confirm UX): captain gate
re-checked every call; self-decision blocked; decision whitelist (`rejected`
only); audit stamp (decider + timestamp); reject is terminal.

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Hard prerequisites that must land first (architecture phases / plan 05):**
1. **Phase 0 — status tokens** (`success`/`warning`/`info` + `--destructive`
   already present) and the `--radius`/font tokens in `globals.css` — gate the
   `IconBadge tone="destructive"` tint and Button radius (foundations-tokens;
   component-library §Notes "NEW status tokens must land before component build").
   *(`destructive` exists today; this dialog needs no NEW token, but rides the
   foundations pass for radius/type normalisation.)*
2. **Leaf primitives:** `Button` (REUSE, [atom-button.md](atom-button.md)),
   `IconBadge` (PROMOTE, [atom-iconbadge.md](atom-iconbadge.md)), `Spinner`
   ([atom-spinner.md](atom-spinner.md)), `Alert` (PROMOTE,
   [molecule-alert.md](molecule-alert.md)), `Dialog` (REUSE
   `@camp404/ui/components/dialog`).
3. **`decideApprovalAction`** — already exists (REUSE, plan 05 §REUSE); **no new
   service work** is required for this organism. (`CaptainLock`,
   molecule-captainlock, for the locked branch is a sibling concern in the roster,
   not a dependency of this dialog.)

No schema, no `@camp404/types`, no `@camp404/core`, no `@camp404/db` work — this
organism is purely presentational over an existing action.

**Steps**
1. **Build `RejectConfirmDialog`** over `@camp404/ui/components/dialog`. Title-bar
   `IconBadge triangle-alert tone="destructive"` + `DialogTitle "Reject
   application"` + `X` close; body `DialogDescription` "Reject {Name}'s
   application?" + the second sentence "They'll be told the application wasn't
   approved. This can't be undone here."; `DialogFooter` **Keep pending**
   (`variant="outline"`) + **Reject** (`variant="destructive"`). `$destructive`
   stroke on `DialogContent` via `className` (440px console skin); mobile inline
   `RejectModal` variant. *AC:* renders all states above; copy matches board §7;
   no raw hex (tokens only); the destructive title bar reads as the board's
   `RejectConfirm`.
2. **Wire reject** — `startTransition(() => onReject(target.id))`; on ok the parent
   flips `approvalStatus` optimistically and closes; on error show `Alert`.
   *AC:* **Reject** disabled + Spinner while pending; on ok the parent's
   Approve/Reject pair disappears (status → Rejected) and counts refresh; on error
   an `Alert` renders and buttons re-enable; **dismiss is suppressed mid-flight**.
3. **Wire keep-pending / dismiss** — Keep pending (and `Esc`/scrim/`X`) →
   `onKeepPending?.()` → `onOpenChange(false)`; no action call. *AC:* member stays
   `pending`; `decideApprovalAction` is **not** called on dismiss.
4. **Mount in the parent** — EXTEND `camp-management-roster.tsx`'s `MemberProfile`
   footer: change the existing **Reject** button from `onClick={() =>
   decide("rejected")}` to **opening this dialog** (set local `rejectOpen` state);
   keep **Approve** as the direct one-click write (no confirm — only reject gets the
   confirmation, per board). Mount `<RejectConfirmDialog>` only in the `{!locked}`
   branch, shown only while `member.approvalStatus === "pending"`. `onReject` wraps
   the existing `decideApprovalAction(member.id, "rejected")` (REUSE `decide`
   logic), `onKeepPending` closes. *AC:* Reject opens the confirm dialog (no longer
   one-click); Approve unchanged; dialog never mounts when `locked` or when
   not-pending; the existing optimistic-flip + `router.refresh()` still fire on
   confirmed reject.
5. **Stories** (`reject-confirm-dialog.stories.tsx`, co-located): `Confirm`,
   `Submitting`, `Error`, `MobileInline`. *AC:* render without console errors;
   `Confirm` matches board §7.
6. **Tests** (`reject-confirm-dialog.test.tsx`, co-located):
   - opens with title "Reject application" + body "Reject {Name}'s application?"
     (name interpolated from `target.displayName`);
   - **Reject** fires `onReject(target.id)` exactly once; disables + shows Spinner
     while pending;
   - on ok → `onOpenChange(false)` is called (dialog closes);
   - on error → `Alert role="alert"` shows the action message, buttons re-enabled,
     dialog stays open;
   - **Keep pending** fires `onKeepPending` (or `onOpenChange(false)`) and does
     **not** call `onReject`;
   - `Esc`/scrim close calls `onOpenChange(false)` (and is suppressed mid-send);
   - **gating** (parent-level test in the roster): with `locked` or a non-pending
     member, the Reject affordance is absent and the dialog is not rendered.
   *AC:* all green; the server-side guards (whitelist / self-guard / audit stamp /
   terminal-reject) are asserted in the **action** test (plan 05), not here — this
   suite covers the confirm UX only.

---

## Consumers — which surfaces mount it

| Consumer | File | How |
|---|---|---|
| **Roster / MemberProfile** (the only mount) | `apps/web/app/captains/camp-management/camp-management-roster.tsx` (the inline member-profile footer) | The **Reject** affordance (shown only while `approvalStatus === "pending"`, captain viewer) opens `<RejectConfirmDialog>`; mounted only in the `{!locked}` captain branch. On confirm it runs the REUSE `decideApprovalAction(id, "rejected")`. |
| **Captain roster surface** (S17 Iteration B) | `surfaces/14-roster.md` §7 ("Reject confirm dialog") | Desktop board #37 (`RejectScrim`/`RejectConfirm`, 440px, `$destructive` stroke) + mobile board #38 (`RejectModal`). Also referenced in `flows.md` (the reject → confirm → terminal path) and `information-architecture.md`. |

**Not a consumer:** there is no other reject/confirm surface in the app. Approve
remains a direct one-click action (no confirm dialog); only rejection — the
terminal, irreversible decision — gets this confirmation gate, per board §7 and
surface §User-actions ("Reject (pending member) → Open Reject-confirm → on confirm
`decideApprovalAction(id, 'rejected')`").

WROTE design/spec/impl/components/organism-rejectconfirmdialog.md
