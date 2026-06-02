# MemberProfile — organism plan

- **mapsTo + home:** **NEW** · lives in **`apps/web`** (component-library MemberProfile entry: "mapsTo: NEW (app-local)"; surfaces/14-roster.md §5 — an **inline expanding panel, not a separate route**) · **Target file:** `apps/web/app/captains/camp-management/member-profile.tsx` (extracted from today's inline `MemberModal`; see Build steps).
- **Composes** (component-library MemberProfile): ProfileHead (Avatar + name + @handle + TeamBadges + status/rank Badges) + bio + ProfileFieldGrid (caption/value, decrypted ID via CodeDisplay redacted) + Actions footer (Approve/Reject/Assign-captain).
- **One-line contract:** the roster's tap-to-open per-member detail panel. Captain-gated; renders the grouped questionnaire profile + decrypted government ID; from it a captain approves/rejects a pending applicant and opens the captain-to-captain double-opt-in. Read-only-data + three mutations, all server-action backed.

---

## Current state — what exists today (the old design's component/route markup)

The behaviour exists today, but as a **modal dialog with tabs**, not an inline panel.

- **`apps/web/app/captains/camp-management/camp-management-roster.tsx` `MemberModal` (L308–502)** — the live "member profile". Anatomy:
  - Renders inside `@camp404/ui` `Dialog`/`DialogContent` (`L372–378`), opened by `row != null`.
  - Fetches detail in a `useEffect` keyed on `rowId` via `getMemberDetailAction(rowId)` (`L326–343`), with **stale-fetch protection** (`cancelled` flag — keep this).
  - `DialogHeader` = display name + `member.approvalSummary` ("Loading…" placeholder) (`L379–384`).
  - **Overview/Profile tabs** (`L386–403`) — bespoke `<button>` tab strip (`tab` state, `L317`). The redesign **collapses these into one scroll** (surface 14 OQ#6 resolution: keep the full grouped profile, board fields as the priority overview ordering).
  - Body (`L405–446`): loading `Loader2` spinner; error `<p class=text-destructive>`; Overview tab = raw `<img>` avatar (`L418–424`, 80px `rounded-full`) + `<DetailList items={member.overview}/>`; Profile tab = grouped `member.profileSections` with bespoke `<h3>` section headings, empty → "No questionnaire answers on record yet." (`L431`).
  - **Actions footer** (`DialogFooter`, `L451–498`): `actionError` `role="alert"` (`L452–455`); Approve/Reject pair shown **only while** `isAwaiting` (`approvalStatus==="pending"`, `L369/L461`); Approve uses raw `bg-emerald-600` (off-token) + `Loader2` while `isPending` (`L479–483`); a permanently-`disabled` **Ping** placeholder ("Coming soon", `L488–496`). **No assign-captain affordance exists today.**
  - `decide()` (`L345–366`): `useTransition`; calls `decideApprovalAction(row.id, decision)`; on success **optimistically flips** `member.approvalStatus` locally so the buttons disappear, then `router.refresh()`.
- **`DetailList` (`L504–524`)** — the `<dl class="grid grid-cols-[max-content_1fr]">` label/value grid; empty → "Nothing recorded." This is the **ProfileFieldGrid** ancestor (PROMOTE target for CodeDisplay's redacted ID cell; molecule-codedisplay.md §Consumers, build step 12).
- **Server action `apps/web/app/captains/camp-management/actions.ts`** — `getMemberDetailAction(userId)` (`L46–68`): `requireCaptain()` gate (`L30–43`) → `getCampMemberDetail` → `decryptOrNull(passportEncrypted/saIdEncrypted)` → `mergeIdNumber` → `presentMemberDetail`. `decideApprovalAction(userId, decision)` (`L75–96`): gate → decision whitelist (`L82`) → **self-guard** `userId === captainId` (`L85`) → `decideUserApproval` → `revalidatePath`.
- **Presenter `apps/web/lib/member-detail.ts`** — `presentMemberDetail(detail): PresentedMember` (`L111–176`): builds `overview[]`, groups answers by questionnaire page into `profileSections[]` (skips intro pages + empty pages, `L151–164`), resolves avatar from `responses["profile.image"]` (`L116–119`), `rankLabel` Captain/Member ternary (`L169`), `describeApproval` summary (`L87–109`). Pure (deliberately not `server-only`, `L6–10`); tested under jsdom (`__tests__/member-detail.test.ts`).
- **`PresentedMember` shape (`member-detail.ts:26–37`)**: `id`, `displayName`, `rankLabel`, `approvalStatus`, `approvalSummary`, `profileImageUrl`, `overview: DetailItem[]`, `profileSections: DetailSection[]`. **No** `handle`, **no** team badges, **no** status tag separate from summary, **no** `canAssignCaptain`, **no** promotion step — all EXTEND targets.

**Gaps vs spec:** modal→inline panel; tabs→single scroll; no @handle; no TeamBadges; no separate status/rank tags; no Avatar atom (raw `<img>`); raw `bg-emerald-600` Approve; off-token `STATUS_STYLE` tints (`L43–49`); no redacted CodeDisplay for the ID; no assign-captain flow at all (the entire double-opt-in is NEW — service-layer plan 05).

---

## Composition — leaves consumed, core helpers, services, server/client split

### Leaf components consumed (link plans)

| Leaf | Plan | Used for | mapsTo / home |
|---|---|---|---|
| `Avatar` (hero, mono-tinted) | [atom-avatar.md](atom-avatar.md) | ProfileHead avatar, `h-16 w-16` (56–64px), `tint`=`avatarTintFor(id)`, square-rounded (`rounded-lg`) per `26-s17`/`37-s17`; photo when `profileImageUrl` | REUSE+EXTEND · `packages/ui` |
| `Badge` | [atom-badge.md](atom-badge.md) | **status tag** (`tone="warning"` Pending / `success` Approved / `destructive` Rejected, `soft-tint`), **rank tag** (`secondary` Captain / `primary` Member), **TeamBadges** (one `tone="accent" soft-tint` chip per team) | PROMOTE · `packages/ui` |
| `CodeDisplay` (redacted) | [molecule-codedisplay.md](molecule-codedisplay.md) | the government **ID/Passport** field — `<CodeDisplay value={decryptedId} redacted aria-label="Government ID" />`; masks display only, never decrypts (codedisplay build step 12) | PROMOTE · `packages/ui` |
| `Button` | [atom-button.md](atom-button.md) | Approve (default/primary) · Reject (outline → opens RejectConfirm) · Assign captain (`$secondary`-tinted, `shield` icon) | REUSE · `packages/ui` |
| `Divider` | [atom-divider.md](atom-divider.md) | rule between fields grid and Actions footer (surface 14 §5 "Divider + Actions footer") | NEW · `packages/ui` |
| `Spinner` | [atom-spinner.md](atom-spinner.md) | inline detail-fetch loading + Approve/Send in-flight (replaces raw `Loader2`) | PROMOTE · `packages/ui` |
| `DetailHeader` | [molecule-detailheader.md](molecule-detailheader.md) | optional — the PanelBar "> nova reyes · profile" + record index (terminal skin); may stay bespoke inline since the console PanelBar is roster-specific | PROMOTE · `packages/ui` |
| `Alert` | [molecule-alert.md](molecule-alert.md) | the `role="alert"` action-error message in the footer (replaces bespoke `<p class=text-destructive>`) | PROMOTE · `packages/ui` |

**ProfileFieldGrid** is the renamed/kept `DetailList` (the `<dl>` grid) — it is **app-local** to this organism (component-library lists `ProfileFieldGrid / DetailList (new)`), not a `@camp404/ui` leaf; its empty state is "Nothing recorded." It hosts the redacted `CodeDisplay` for the ID cell.

### Sibling organisms it triggers (NOT children — peers mounted by the roster)

| Sibling | Plan source | Relationship |
|---|---|---|
| `AssignCaptainDialog` (+ `OptInStepTracker`) | component-library AssignCaptainDialog; surface 14 §6 | MemberProfile's "Assign captain rank" button opens it; passes `target` + `requestState`; MemberProfile does **not** render it inline |
| `RejectConfirmDialog` | component-library RejectConfirmDialog; surface 14 §7 | MemberProfile's Reject button opens it; on confirm the dialog calls `decideApprovalAction(id,"rejected")` |

These are separate organisms with their own plans; MemberProfile exposes `onApprove`/`onReject`/`onAssign` callbacks (component-library Props) and the parent roster wires the dialogs. Approve fires directly; Reject/Assign open a dialog.

### `@camp404/core` helpers

- `initialsFrom(name)` — Avatar initials (architecture §Hybrid: `apps/web/lib/initials.ts` → `core/text`). Consumer-called; Avatar atom stays logic-free (atom-avatar.md §Composition).
- `avatarTintFor(id)` — deterministic per-member tint for the hero Avatar (NEW, `@camp404/core`; atom-avatar.md step 1).
- `promotionStepState(request | null)` — drives the assign-captain visibility/step state surfaced on the detail (`packages/core/src/promotion.ts`, NEW; service-layer 05 §core). Consumed via the action result, not imported into the client.
- `canSendPromotion({viewerRank, viewerId, targetRank, targetId})` — server-side gate for the assign button visibility (service-layer 05); the client receives a precomputed `canAssignCaptain` boolean.

The component imports **no** core directly except via the leaf Avatar/CodeDisplay; all domain logic is precomputed server-side into the view-model. Layering holds: `@camp404/ui` may import `types`+`core`, never `db`/`next`; this organism is app-resident `"use client"` and imports leaves + types only.

### Services / server-actions called (named from service-layer/05)

- **`getMemberDetailAction(userId)`** (`actions.ts`, EXTEND) — fetch on row open; captain-gated; decrypts ID; returns `PresentedMember`. **EXTEND** to add `canAssignCaptain` + `promotionStep` (via `getOpenPromotionRequest` → `promotionStepState`) and carry `handle` (service-layer 05 §Target API).
- **`decideApprovalAction(userId, "approved"|"rejected")`** (`actions.ts`, REUSE) — Approve fires it directly; Reject fires it on RejectConfirm confirm.
- **`sendCaptainPromotionAction(targetUserId)`** (`actions.ts`, **NEW** — service-layer 05 step 7) — wired through `AssignCaptainDialog`; `requireCaptain` → `canSendPromotion` (core) → `sendPromotionRequest` (db) → `revalidatePath`. **Rank never flips on send.**
- Underlying data-access (NOT called from the client): `getCampMemberDetail` (REUSE), `decryptOrNull`+`mergeIdNumber` (REUSE, behind `requireCaptain`), `getOpenPromotionRequest` (NEW `packages/db/src/captain-promotion.ts`), `setUserApproval` (REUSE). Acceptance-side actions (`acceptCaptainPromotionAction` etc.) belong to the **home rank-section / notifications** surface, not this organism.

### Server-component vs "use client" split

- **`MemberProfile` is `"use client"`.** It owns the open/loading/error/optimistic-decision state, the detail fetch, `useTransition`, and the stale-fetch guard (today's `MemberModal` logic, lifted out of the dialog shell). It receives only the selected `row` (or `rowId`) + `isCaptain` + callbacks from the client roster.
- **All data crosses a server boundary.** `getMemberDetailAction` runs on the server (`"use server"`, `actions.ts`); the heavy `QUESTIONNAIRE` catalogue + raw answers + decrypt key never reach the client — only the flat `PresentedMember` view-model does (member-detail.ts header comment). The decrypted ID arrives as an already-decrypted string and is **masked client-side** by `CodeDisplay redacted` (it never re-decrypts).
- The route `page.tsx` (server) stays the gate (`isCaptain ? roster.map(toRosterRow) : []`, page.tsx:31–33) and renders the client roster which mounts MemberProfile.

---

## API & data flow

### Props (component-library MemberProfile + surface 14 §5)

```ts
interface MemberProfileProps {
  /** The selected roster row (null = panel closed/unmounted). Carries id,
   *  displayName, handle, status, rank, tint seed for instant head render
   *  before the detail fetch resolves. */
  row: RosterRow | null;
  /** Viewer is a captain — gates the Assign-captain affordance (server also
   *  re-checks via canAssignCaptain on the fetched detail). */
  isCaptain: boolean;
  /** Approve a pending applicant. Parent calls decideApprovalAction(id,"approved"). */
  onApprove: (id: string) => void;
  /** Open RejectConfirmDialog for this target. */
  onReject: (target: RosterRow) => void;
  /** Open AssignCaptainDialog for this target. */
  onAssign: (target: RosterRow) => void;
  /** Close / clear selection (Esc / X / scrim-equivalent). */
  onClose: () => void;
}
```

### Fetched vs received

- **Received (instant, from the row):** `id`, `displayName`, `handle`, derived status, rank, avatar tint seed — enough to paint the **ProfileHead skeleton** immediately on open (no flash of empty).
- **Fetched (async, server action):** the full `PresentedMember` — `bio`, `overview[]` (Country/Email*/Dietary/Emergency/Arrival/ID/Outstanding/"bring to camp"), grouped `profileSections[]`, decrypted `id.number`, `approvalSummary`, **and the EXTEND fields** `canAssignCaptain` + `promotionStep` + `handle`.
- **State flow:** open → paint head from `row` → fetch → `loaded`/`error`. Decisions are **optimistic**: on Approve success, locally flip `approvalStatus` so Approve/Reject vanish, then `router.refresh()` to refresh stats/counts (surface 14 §States Success: "counts refresh `revalidatePath` + `router.refresh()`"). Rapid row switches **discard stale responses** (the `cancelled` flag — preserved).

### Forms: actions + validation

This organism has **no form fields** — its three mutations are button-triggered server actions, each re-validated server-side (not client-trusted):
- **Approve/Reject:** decision whitelist + self-guard + audit stamp (`decideApprovalAction`, actions.ts:82–93). Reject routes through `RejectConfirmDialog` first (no undo — surface 14 §7).
- **Assign captain:** `canSendPromotion` guard (viewer is captain && target not captain && target≠viewer); idempotent send (one open `sent` row per target via partial unique index, service-layer 05 §schema). **Rank does not change on send.**

---

## States — full matrix incl. global + gating

| State | Behaviour | Source |
|---|---|---|
| **Closed / unmounted** | `row == null` → panel not rendered; in locked view, dialogs/profile **not mounted at all** | surface 14 §State "dialogs/profile not mounted" |
| **Loading** | Head painted from `row`; body shows `Spinner` + "Loading…" in the summary line; stale fetch on rapid switch discarded | surface 14 §States Loading; MemberModal L406–410 |
| **Populated** | ProfileHead (Avatar + name + @handle + TeamBadges + status/rank Badges) + bio + ProfileFieldGrid (incl. redacted ID) + grouped sections + Actions footer | surface 14 §5 |
| **Empty (field-level)** | profile with no answered questions → "No questionnaire answers on record yet."; a grid with no items → "Nothing recorded."; missing field → board placeholder e.g. dietary "Not provided yet — we'll show it here once {name} adds it" | surface 14 §States Empty; member-detail.ts L161 / L509–512 |
| **Action-error** | failed decision/assign → `Alert role="alert"` in the footer ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in."); detail-fetch fail → body "Member not found." | surface 14 §States; actions.ts error strings |
| **Submitting** | the in-flight button swaps to `Spinner`, all action buttons `disabled` during the `useTransition` pending window (Approve, Reject-confirm, Send-request) | surface 14 §States Submitting; MemberModal L467/L475 |
| **Success** | decision → Approve/Reject disappear (no longer pending), status Badge + roster counts refresh (optimistic local flip + `router.refresh()`); assign send → dialog step 1 "Done" / step 2 "Pending", request now in-flight | surface 14 §States Success |
| **Disabled** | Ping placeholder (if carried) permanently disabled "Coming soon"; in locked view all controls inert | surface 14 §User actions; MemberModal L488–496 |
| **Self (viewer = target)** | Approve/Reject/Assign **hidden** (self-guard); rejected server-side too | component-library MemberProfile variant "self (actions hidden)"; actions.ts:85 |
| **Variant: pending** | Approve + Reject shown | component-library variant "pending" |
| **Variant: approved / rejected** | Approve/Reject absent; status Badge reflects state; Assign-captain may still show (approved non-captain, viewer captain, not self) | component-library variants "approved"/"rejected" |

### Global matrix + gating (preview-but-locked)

This organism lives on a **captain/rank surface**, so it inherits decision #3:
- **Preview-but-locked (non-captain viewer):** the **page** returns zero rows and renders `CaptainLock`; **MemberProfile is NOT mounted** (no row to select; dialogs/profile not mounted — surface 14 §8/§States). Preview-but-locked here means *absence*, not a dimmed render — never a redirect, never a populated-then-dimmed leak (`flows.md` §3.3 invariant #2). There is no inline `CaptainLock` *inside* MemberProfile; the lock is the surrounding surface's responsibility.
- **Server re-gate on every action:** `requireCaptain()` re-checks `rank==='captain'` on `getMemberDetailAction`, `decideApprovalAction`, `sendCaptainPromotionAction` — the client `isCaptain` prop is a UI convenience, never the security boundary.
- **PII (⛔ blocking):** the **Email** field is gated on the data-owner decision (surface 14 OQ#1, architecture OQ#4, service-layer 05 step 9). Until a mitigation is recorded, `presentMemberDetail` **omits the email field (or masks it)** — do not ship plaintext email. The redacted government ID is fine (already captain-gated + masked).
- **Not applicable:** onboarding-incomplete gate (page gate runs first); offline/sync; validation-error (no inputs).

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Dependency prerequisites (must land first):**
- Foundations tokens (`success`/`warning`/`info`, `--font-mono`) — gates Badge/CodeDisplay/Spinner (foundations-tokens.md, architecture Phase 0).
- Leaves: `Avatar` EXTEND (+`avatarTintFor` in core), `Badge`, `CodeDisplay`, `Divider`, `Spinner`, `Alert` (their plans, Phase 5).
- Service-layer 05: `0012` migration + `captain-promotion.ts`, `packages/core/src/promotion.ts`, `lib/camp-roster.ts` `handle` EXTEND, `presentMemberDetail` EXTEND (`canAssignCaptain`/`promotionStep`/`handle`), `sendCaptainPromotionAction` NEW (Phases 2–4). Sibling organisms `AssignCaptainDialog`/`RejectConfirmDialog` plans.

1. **EXTEND the view-model + action (service-layer 05).** Add `handle`, `bio`, separate `statusTag`, `teams[]`, `canAssignCaptain`, `promotionStep` to `PresentedMember` (member-detail.ts); EXTEND `getMemberDetailAction` to look up `getOpenPromotionRequest` → `promotionStepState`. *AC:* the action returns the new fields; rank unchanged. *Test:* EXTEND `member-detail.test.ts` (jsdom) — team badges built, self-target → `canAssignCaptain=false`, already-captain target → false.
2. **Extract `MemberProfile` from `MemberModal`** into `member-profile.tsx`. Move the fetch/`useEffect`/stale-guard/`decide()`/`useTransition` logic verbatim; **drop the `Dialog` shell** — render an inline expanding panel (surface 14 §5). Keep the `cancelled` stale-fetch guard. *AC:* opening a row renders the panel inline (not a modal); rapid switches show no stale data. *Test:* RTL — open row → loading spinner → populated; switch rows mid-flight → only the latest detail renders.
3. **Collapse tabs into one scroll.** Remove the Overview/Profile `tab` state + tab strip; render ProfileHead → bio → overview grid → grouped sections in a single scroll (surface 14 OQ#6). *AC:* no tab buttons; all sections visible in one scroll; empty sections skipped. *Test:* RTL — no `role` tabs; "No questionnaire answers…" shown when sections empty.
4. **ProfileHead** with `Avatar` (hero, `tint=avatarTintFor(id)`, photo when present) + name + `@handle` + TeamBadges (`Badge tone="accent"`) + status Badge + rank Badge. *AC:* matches `37-s17`/`38-s17` head; team chips one per membership; null handle → agreed fallback (surface 14 OQ#2). *Test:* RTL — badges render per status/rank; photo vs initials fallback.
5. **ProfileFieldGrid + redacted ID.** Keep `DetailList` grid; render the ID/Passport cell as `<CodeDisplay value={decryptedId} redacted aria-label="Government ID" />` (codedisplay step 12). *AC:* bullets shown, raw ID **absent from DOM**; empty grid → "Nothing recorded." *Test:* RTL — `queryByText(rawId)` is null; bullets present.
6. **Actions footer** with `Divider` + `Alert` error + tokenised `Button`s. Approve (`onApprove`), Reject (`onReject` → opens dialog), Assign captain (`shield`, shown only when `canAssignCaptain`, `onAssign` → opens dialog). Replace raw `bg-emerald-600` with token Button; replace `Loader2` with `Spinner`; carry/keep Ping as optional disabled placeholder. *AC:* Approve/Reject only while pending; Assign hidden for self/already-captain/non-captain; in-flight disables buttons + shows Spinner. *Test:* RTL — pending shows Approve+Reject; approved hides them; self hides all three; click Approve → `decideApprovalAction` called + optimistic flip.
7. **Wire siblings in the roster.** Parent mounts `AssignCaptainDialog`/`RejectConfirmDialog`, passing `target` + (for assign) `promotionStep`/request state; Reject confirm calls `decideApprovalAction(id,"rejected")`; Assign send calls `sendCaptainPromotionAction(targetUserId)`. *AC:* Reject opens confirm (no undo); Assign send creates exactly one `sent` row (idempotent), rank unchanged; double-send no-op. *Test:* action-level — send does not flip rank; second send reuses the open row.
8. **PII email gate (⛔).** Do not render plaintext email until the data owner records a mitigation (surface 14 OQ#1). Until then omit/mask the field in `presentMemberDetail`. *AC:* no plaintext email in DOM absent a recorded decision.
9. **Token + a11y cleanup.** Remove `STATUS_STYLE` emerald/amber/sky/rose (absorbed by Badge tones); `grep` zero off-token tints in the file; panel has an accessible name; action error in a live region. *AC:* `grep -E "bg-(emerald|amber|sky|rose)-" member-profile.tsx` → empty; lint clean.

---

## Consumers — which surfaces mount it

| Surface | Route | How it mounts MemberProfile |
|---|---|---|
| **Roster / camp management** (surfaces/14-roster.md §5) | `/captains/camp-management` | The client roster (`camp-management-roster.tsx`, today `RosterTable`/`RosterList`) mounts `MemberProfile` inline when a `RosterRow` is tapped; passes the selected row, `isCaptain`, and `onApprove`/`onReject`/`onAssign`/`onClose`. **Only consumer.** Non-captains never mount it (preview-but-locked: page sends zero rows, `CaptainLock` instead). |

Note: surfaces/07-profile-view.md (`/profile`) is the member **self-view** card — a distinct, read-only surface that does NOT use this organism (no roster row, no captain actions). MemberProfile is captain-only roster detail.
