# InviteForm — organism plan

- **mapsTo + home:** **REUSE/EXTEND — keep app-local** (per `component-library.md §InviteForm`: "mapsTo: keep app-local (`invite-form.tsx`). Email InputField + NoteField + CaptainOptions(Checkbox + Stepper) | MemberNote(Alert) + CodeDisplay(shuffle) + AvailabilityHint + Create Button → SuccessPanel."). It is **not** promoted to `@camp404/ui`: it is `"use client"`, owns a fetch side-effect (the debounced availability oracle), binds to the app-local invite `Availability` union + the app-resident `createInviteAction` server action, and has a single surface consumer (S14). `@camp404/ui` must stay browser-global-free and domain-free, so this organism stays in `apps/web`.
- **Target file:** `apps/web/app/tools/invite/invite-form.tsx` (existing `"use client"` file — kept, refactored, not relocated).

> The component **exists and works today**. This is an **EXTEND**: the rank-branched form, the `idle|checking|available|taken|invalid` availability state machine, the captain knobs, the success swap, and the two-pass (client-convenience / server-authoritative) validation all survive. The redesign (a) decomposes the in-file private sub-components into their canonical leaves (`AvailabilityHint`, `Stepper`, `CodeDisplay`, `InputField`, `Alert`), (b) replaces the bare `type="number"` use-cap with the `Stepper` affordance the board draws, (c) renders the `MemberNote` as an `Alert info` row (a code branch that does not exist live yet), (d) single-sources the rules-hint via `@camp404/core`, and (e) snaps off-token colours (`emerald-400`) to `text-success`. **No functionality is dropped.**

---

## Current state — what exists today (the old design's component/route markup)

Confirmed by reading source.

- **`apps/web/app/tools/invite/invite-form.tsx`** (369 lines, `"use client"` line 1) — a **monolith** holding five things in one file:
  - `InviteForm({ isCaptain })` (lines 30–210) — the organism. Seeds `code` once via `generateInviteCode()` (line 31), runs the debounced (350 ms) availability check `useEffect` (lines 48–91) against `GET /api/tools/invite/check`, drives the mint via `useActionState(createInviteAction, null)` (lines 41–44), and swaps to `<SuccessPanel>` on `result?.ok` (lines 93–102).
  - The local `Availability` union type (lines 23–28) — `idle | checking | available | taken | invalid (with hint)`.
  - `AvailabilityHint({ availability, code })` — private, unexported (lines 212–255). Uses **off-token** `text-emerald-400` for `available` (line 229) and the wrong icons (`Check`/`X` instead of `circle-check`/`circle-x`); no `aria-live`.
  - `CaptainOptions({ preApprove, onPreApproveChange, maxUses, onMaxUsesChange })` — private (lines 258–315). Renders the pre-approve `Checkbox` row + a **bare `<Input type="number" min={1} max={100} className="w-28">`** (lines 297–306) — **no −/+ stepper** (the board draws one).
  - `SuccessPanel({ code, email, maxUses, requiresApproval })` — private (lines 317–368). Composes the share/uses/approval copy, a `font-mono text-lg` CodeBox with a bare `setTimeout(...,1500)` Copy flip (no unmount cleanup, lines 353–359), and a "Send another" `<a href="/tools/invite">`.
- **The whole form is wrapped in `Card`/`CardHeader`/`CardContent`** (lines 105–208) with a **rank-branched `CardDescription`** (lines 108–112) — captain vs member copy.
- **Email field** (lines 116–128) — label + `required` flip on `multiUse` (`isCaptain && Number(maxUses) > 1`, line 39): "Their email address" / required when single-use; "Lead recipient's email (optional)" / not-required when captain multi-use.
- **Note field** (lines 130–138) — `Textarea rows={3}`, always optional.
- **MemberNote** (lines 147–152) — currently a plain `<p className="rounded-md border bg-muted/40 …">`, **not** an `Alert` with an `info` icon (the board/spec want the icon row).
- **Code field** (lines 154–177) — `Input className="font-mono"` + a separate Shuffle `Button variant="outline" size="icon"` + `<AvailabilityHint>` below.
- **Server error banner** (lines 179–186) — a hand-rolled `<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 …">` (the closest-to-spec inline Alert in the repo, per `molecule-alert.md` §Current state).
- **Create button** (lines 188–205) — full-width primary; disabled on `isPending || checking || taken || invalid`; "Creating…" + `Loader2` while pending.

Server/gating context (not part of the client component, but it is the host):
- **`apps/web/app/tools/invite/page.tsx`** (server, `force-dynamic`, lines 12–32) — `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` gate (`redirect("/signup/required")`) → `isApproved` gate (`redirect("/pending-approval")`) → renders the ghost-back `Button` (links `/tools`) + `<InviteForm isCaptain={campUser.rank === "captain"} />`. Wrapper is `mx-auto max-w-xl` (the wider-than-default container — S14 OQ #5).
- **`apps/web/app/tools/invite/actions.ts`** — `createInviteAction` (the server action this form posts to; see §Composition).
- **`apps/web/lib/invite-words.ts`** — `generateInviteCode`, `isSyntacticallyValidCode` (today imported via `@/lib/invite-words`; moving to `@camp404/core`).
- **`apps/web/app/api/tools/invite/check/route.ts`** — the availability oracle the `useEffect` fetches.

**Classification confirmed: REUSE/EXTEND, app-local.** The file exists; no relocation. The redesign refactors its internals into named leaves and closes the gaps below.

### Gap vs spec (board #23 + S14 surface brief)

| Gap | Source | Action |
|---|---|---|
| Bare `type="number"` use-cap; board draws a −/+ stepper docked inside a `NumberInput` row | `molecule-stepper.md`; S14 §4 | Replace with `<Stepper>` backed by a real number value + `[1,100]` clamp |
| `MemberNote` is a plain `<p>`, not an `info`-icon `Alert` row | S14 §5; `molecule-alert.md` §MemberNote | Render `<Alert variant="info">` with a Lucide `info` icon |
| Server-error banner hand-rolled inline | `molecule-alert.md` (this file is one of its six PROMOTE sources) | Render the canonical `<Alert variant="destructive" role="alert">` |
| `AvailabilityHint` private + off-token (`emerald-400`) + wrong icons + no `aria-live` | `molecule-availabilityhint.md` | Extract to `availability-hint.tsx`; `text-success`; `circle-check`/`circle-x`; `role="status" aria-live="polite"` |
| Code row + success CodeBox hand-rolled; copy `setTimeout` has no unmount cleanup | `molecule-codedisplay.md` | Replace with `<CodeDisplay>` (`editable-shuffle` + `readonly-copy`); timer cleanup moves into the component |
| Email + note label/input pairs hand-rolled (`space-y-2`) | `molecule-inputfield.md` (this file is a PROMOTE source) | Replace with `<InputField>` (email gets `className="font-mono"` only on the code field, not email) |
| Client rules-hint string `"3–48 chars, …"` hardcoded; diverges from server `CODE_RULES_HINT` | S14 OQ #3; `service-layer/02-invites.md` §EXTEND.1 | Import the single `CODE_RULES_HINT` from `@camp404/core` |
| `generateInviteCode`/`isSyntacticallyValidCode` imported from `@/lib/invite-words` | `architecture.md` §core; `service-layer/02-invites.md` | Re-point imports to `@camp404/core` |
| Stale Tools-hub "single-use" copy + S03 `CAMP-XXXX-XXXX` placeholder | S14 OQ #7 | Out of this component; flagged for the surface pass (S13/S03 copy) |

---

## Composition — leaf components, @camp404/core helpers, services, server/client split

### Server-component vs `"use client"` split

**`"use client"`** (unchanged). InviteForm is interactive: controlled code input, debounced fetch side-effect, `useActionState`, stepper/checkbox handlers, clipboard. The **rank decision is made on the server** (`page.tsx` reads `campUser.rank`) and passed in as the sole `isCaptain` prop — the client never reads rank from the session, and the server action **recomputes** `isCaptain` from the DB row regardless of what is posted (the one safe rank boundary). The availability oracle is a **route handler**, not a server action; the mint is a **server action**.

### Leaf components it consumes

| Leaf | Plan file | Package | Role in InviteForm |
|---|---|---|---|
| `InputField` | `design/spec/impl/components/molecule-inputfield.md` | `@camp404/ui/components/input-field` (PROMOTE) | Email field (label/required flip on `multiUse`); the editable code field's label (the input itself becomes `CodeDisplay`). Replaces the inline `space-y-2` Label+Input pairs. |
| `LongTextField` (NoteField) | `design/spec/impl/components/organism-longtextfield.md` | app-local (`question.tsx` sub-renderer) | **Reference only** — the spec's "NoteField" is the optional reason `Textarea` (`rows={3}`). InviteForm uses the **`Textarea` atom** directly here (no voice/dictation on the note — voice is field-level only, and this note is not a questionnaire field). The component-library "NoteField" label maps to a plain labelled `Textarea`, not the questionnaire `LongTextField` organism. |
| `Textarea` | `design/spec/impl/components/atom-textarea.md` | `@camp404/ui/components/textarea` | The note body (`rows={3}`, optional, both ranks). |
| `Checkbox` | (REUSE atom) | `@camp404/ui/components/checkbox` | Pre-approve toggle inside `CaptainOptions`; `name="preApprove"`, controlled, submits `"on"`. |
| `Stepper` | `design/spec/impl/components/molecule-stepper.md` | app-local (`apps/web/app/tools/invite/stepper.tsx`, NEW) | Captain multi-use cap `[1,100]`; −/+ buttons over a real number input. Replaces the bare `type="number"`. |
| `CodeDisplay` | `design/spec/impl/components/molecule-codedisplay.md` | `@camp404/ui/components/code-display` (PROMOTE) | **Two instances:** `editable-shuffle` variant for the code row (`onChange` lowercases, `onShuffle` re-rolls); `readonly-copy` variant for the SuccessPanel CodeBox (clipboard + "Copied" flip, unmount-safe timer). |
| `AvailabilityHint` | `design/spec/impl/components/molecule-availabilityhint.md` | app-local (`apps/web/app/tools/invite/availability-hint.tsx`, NEW) | The live availability line beneath the code row; consumes the `Availability` union. |
| `Alert` | `design/spec/impl/components/molecule-alert.md` | `@camp404/ui/components/alert` (PROMOTE) | **Two uses:** `MemberNote` (`variant="info"`, `info` icon, muted — member variant only); the server-error banner (`variant="destructive"`, `role="alert"`). |
| `Button` | `design/spec/impl/components/atom-button.md` | `@camp404/ui/components/button` | CreateBtn (`type="submit"`, full-width, pending state); SuccessPanel "Send another" (`asChild` → `<a>`). The Shuffle + Copy buttons are owned **inside** `CodeDisplay`. |
| `Card` family | `design/spec/impl/components/molecule-card.md` | `@camp404/ui/components/card` | Form wrapper + SuccessPanel wrapper (reconcile to card-both, S14 OQ #1). |
| `SuccessPanel` / `CaptainOptions` | (no separate leaf plan) | app-local, in `invite-form.tsx` | Remain **private composition shells** inside this organism — they compose the leaves above; they are not standalone library components. The merge map does not name them as canonicals. |

### `@camp404/core` helpers (pure, no `next/*`, no DB)

| Helper | Source today → `core` | Use |
|---|---|---|
| `generateInviteCode()` | `apps/web/lib/invite-words.ts` → `@camp404/core` (EXTEND-move, behaviour unchanged) | Seed the initial slug + re-roll on shuffle |
| `isSyntacticallyValidCode(raw)` | same move | Client-side instant syntax check before the debounced fetch |
| `CODE_RULES_HINT` | same move (becomes the **single source** for the client hint — fixes S14 OQ #3) | The `invalid`-state hint string in `AvailabilityHint` |
| `CODE_PATTERN` / `INVITE_CODE_MIN` / `INVITE_CODE_MAX` | NEW exports (extracted constants) | Shared by client/server/tests (no duplicated regex/bounds) |

Per `architecture.md` §`@camp404/core` (lines 116–164) these are explicitly listed core extractions (Invites, plan 02). InviteForm imports the pure helpers from `@camp404/core`; no DB or Next code enters the client bundle.

### Services / server-actions it calls

| Symbol | Location | Plan | InviteForm's call |
|---|---|---|---|
| `createInviteAction(_prev, formData)` | `apps/web/app/tools/invite/actions.ts` (`"use server"`) | `service-layer/02-invites.md` §App actions (EXTEND) | The mint. Bound via `useActionState`; consumes the `<form>` `FormData` (`email`, `note`, `code`, captain-only `preApprove`/`maxUses`). Returns `CreateInviteResult` (`{ok:true, code, invitedEmail, maxUses, requiresApproval}` or `{ok:false, error}`). Re-validates everything server-side (the security boundary); recomputes `isCaptain` from the DB row; always inserts `assigned_rank = NULL`. |
| `GET /api/tools/invite/check?code=…` | `apps/web/app/api/tools/invite/check/route.ts` (route handler, `runtime="nodejs"`) | `service-layer/02-invites.md` §Route handlers (EXTEND — reconcile prod/test existence semantics, OQ #4) | The availability oracle, fetched in the debounced `useEffect`. Returns `{available, reason?: "empty"\|"invalid"\|"taken", hint?}`. Rate-limited 30 req/60 s per user id → 429; the client treats any non-OK/thrown/aborted response as `idle` (hint disappears). |
| `createInviteCode(input)` | `packages/db/src/invite-codes.ts` | `service-layer/02-invites.md` (REUSE) | Called **by the action, not by the client** — listed for the data-flow trace (writes the `invite_codes` PK row; no schema change). |

The form does **not** call any service directly from the client beyond the fetch to the check route; all writes go through the server action. No `@camp404/db` import appears in this `"use client"` file (it must not).

---

## API & data flow — props/inputs, fetch vs receive, state, form actions + validation

### Props (the only input the client sees)

```ts
function InviteForm({ isCaptain }: { isCaptain: boolean })
```

`isCaptain` is computed on the **server** (`page.tsx`: `campUser.rank === "captain"`) and passed down. It is the **sole** rank input the client receives — there is no captain-only *data* on this surface, so no `CaptainLock` preview-but-locked treatment applies (see §States). The client uses `isCaptain` only to branch the UI (`CaptainOptions` vs `MemberNote`, email-required flip); the server **re-derives** it for every invariant, so a crafted POST cannot escalate.

### What it fetches vs what it receives

- **Receives** (props / server-rendered): `isCaptain`; the page-level gating already passed (an unauthenticated / non-camp-active / unapproved user never reaches the component — they were redirected in `page.tsx`).
- **Fetches** (client side-effect): `GET /api/tools/invite/check?code=<slug>` — debounced 350 ms, `AbortController`-cancelled on the next keystroke/unmount. Drives the `availability` state only.
- **Posts** (server action): the `<form action={formAction}>` `FormData` to `createInviteAction`; the returned `CreateInviteResult` flows back through `useActionState`.

### State flow

| State | Owner | Shape | Drives |
|---|---|---|---|
| `code` | `useState(() => generateInviteCode())` | `string` (lowercased on change/shuffle) | `CodeDisplay` value; the debounced fetch; the SuccessPanel slug |
| `availability` | `useState<Availability>({state:"idle"})` | `idle\|checking\|available\|taken\|invalid` | `AvailabilityHint`; the CreateBtn disabled set |
| `preApprove` | `useState(false)` (captain only) | `boolean` | `requiresApproval = !preApprove`; helper copy; posts `"on"` |
| `maxUses` | `useState("1")` (captain only) | numeric string | `multiUse` flag → email label/required flip; `Stepper` value; helper copy |
| `result` / `isPending` | `useActionState(createInviteAction, null)` | `CreateInviteResult \| null` / `boolean` | success swap; server-error `Alert`; CreateBtn pending label/disable |
| `copied` | `useState` inside `CodeDisplay` (success CodeBox) | `boolean` | Copy → "Copied" flip (1500 ms, unmount-safe) |

Derived (not stored): `multiUse = isCaptain && Number(maxUses) > 1`.

### Form actions + validation (two-pass)

- **Pass 1 — client (UX convenience only):** instant `isSyntacticallyValidCode(code)` (→ `invalid` hint) + the debounced availability fetch (→ `available`/`taken`). Gates the CreateBtn disabled set. Not a security boundary.
- **Pass 2 — server (authoritative):** `createInviteAction` re-validates from scratch: auth (`Not signed in.`), camp-access (`Your account isn't camp-active yet.`), captain recompute, email (`EMAIL_PATTERN`, required when single-use → `Enter a valid email address.`), `maxUses` integer `[1,100]` (captain only → `Max uses must be a whole number between 1 and 100.`), code syntax (→ `Invite code must be 3–48 chars, …`), uniqueness pre-check (`findInviteCodeByCode` → `'<code>' is already taken.`), insert with the unique PK as the final race backstop (→ `Couldn't save invite. Try a different code.`).
- **Server-enforced invariants** (cannot be bypassed by a crafted POST): member → `requiresApproval=true`, `maxUses=1`, email required; captain → `requiresApproval=!preApprove`, `maxUses∈[1,100]`, email required only when single-use; **always `assigned_rank=NULL`** (captain-tier codes are CLI-only).

---

## States — every state incl. global matrix + gating

### Form field / availability states (client state machine: `idle | checking | available | taken | invalid`)

| State | Trigger | UI |
|---|---|---|
| **empty / seeded (initial)** | mount with a freshly generated slug; email + note blank; captain knobs default (pre-approve OFF, `maxUses="1"`) | The seeded code triggers an immediate check; no hint until it resolves. CreateBtn enabled by default. |
| **checking (loading)** | debounced fetch in flight | `AvailabilityHint`: `Loader2` (spinner) + "Checking availability…" (`text-muted-foreground`); CreateBtn **disabled**. |
| **available** | check → `{available:true}` | `circle-check` (`text-success`) + "`<code>` is available." (mono slug, `text-success`); CreateBtn **enabled**. |
| **taken** | check → `{reason:"taken"}` | `circle-x` (`text-destructive`) + "`<code>` is already taken — pick another."; CreateBtn **disabled**. |
| **invalid** | client `!isSyntacticallyValidCode` OR check → `{reason:"invalid"}` | `circle-x` (`text-destructive`) + `CODE_RULES_HINT`; CreateBtn **disabled**. |
| **idle (no hint)** | empty code, or any fetch error/abort/429 | `AvailabilityHint` renders nothing; CreateBtn **enabled** (server is the backstop — submit not blocked on `idle`). |

### Submission / result states

| State | Trigger | UI |
|---|---|---|
| **submitting / pending** | `isPending` (action in flight) | CreateBtn → `Loader2` + "Creating…", **disabled**, `opacity-70`. |
| **server-error** | `result && !result.ok` | `<Alert variant="destructive" role="alert">` with `result.error`; **client state preserved** (typed code stays); form remains editable. |
| **success** | `result?.ok` | Whole form region swaps to the SuccessPanel card (see below). |

### Success state (SuccessPanel)

- **Head:** `circle-check` (`text-success`) + "Invite ready".
- **Composed copy:** share line (`email` → "Share this code with `<email>`. " else "Share this code. ") + uses line (`maxUses===1` → single-use phrasing; else "Up to N people…") + approval line (`requiresApproval` → "…need a captain's approval…" else "…pre-approved — straight in after onboarding.").
- **Meta rows:** `users` icon + uses line; `shield-check` icon + approval line.
- **CodeBox:** `<CodeDisplay readonly-copy>` — mono slug + Copy (`navigator.clipboard.writeText(code)`, label flips "Copied" 1500 ms, **timer cancelled on unmount**).
- **Actions:** primary "Copy" (full-width) + outline "Send another" (`<a href="/tools/invite">` → full reload resets the form).

### Rank / variant states

| Variant | `CaptainOptions` | `MemberNote` | Email | Server-enforced |
|---|---|---|---|---|
| **member** (`!isCaptain`) | hidden | shown (`Alert info`) | always required | `requiresApproval=true`, `maxUses=1` |
| **captain** (`isCaptain`) | shown (pre-approve `Checkbox` + `Stepper`) | hidden | required only when single-use (`maxUses===1`) | `requiresApproval=!preApprove`, `maxUses∈[1,100]` |

Exactly one of `{CaptainOptions, MemberNote}` renders, branched on `isCaptain`.

### Disabled

CreateBtn disabled when `isPending || availability ∈ {checking, taken, invalid}`. (Notably **not** disabled on `idle` or `available`.) Within `CaptainOptions`, the `Stepper` `−` button disables at `min` (1), `+` at `max` (100).

### Gating states (entry — owned by `page.tsx`, not the component)

| Gate | Behaviour |
|---|---|
| **invite-gated** | `!hasCampAccess(campUser, primaryEmail)` → `redirect("/signup/required")`. Action backstop: `{ok:false,"Your account isn't camp-active yet."}`. |
| **pending / rejected approval** | `!isApproved(...)` → `redirect("/pending-approval")` (covers both, neither is `approved`). |
| **onboarding-incomplete** | NOT enforced here (no `nextGate`/required-actions check on this page). **Build reconciliation** (S14 OQ #2): an approved-but-onboarding-incomplete user could reach the tool — confirm intended or add the gate. |
| **rate-limited (check oracle)** | `GET …/check` 30 req/60 s/user → 429; client treats as `idle` (no explicit "rate limited" UI). Mint action is **not** separately rate-limited. |

### Preview-but-locked (`CaptainLock`) — NOT applicable

This surface is reachable by **both** ranks and resolves rank gating **in-form** (`CaptainOptions` vs `MemberNote`), not via the shared `CaptainLock` lock surface. Decision #3's preview-but-locked treatment applies to captain-only **data** surfaces; the invite tool serves both ranks with **no hidden data**, so no inert/render-structure-only locking, no overlay, no redirect. (Explicitly confirmed in S14 §"Gating states" and §"Components used → Not used".)

### Not applicable

Offline/sync, budget/over-target, empty-list — none in this product/surface.

---

## Build steps — ordered, with dependency prerequisites + acceptance + tests

> Plan-doc only. The implementing pass executes these. Respect existing tests: `apps/web/tests/e2e/invite-tracking.spec.ts`, `apps/web/lib/test-store.ts` (invite methods).

**Prerequisite leaves/services that must land first:**
1. **Foundations tokens** — `--color-success` (+ `--color-success-foreground`) in `packages/ui/src/styles/globals.css` (design-tokens.md §2.2); `--font-mono` wired (§1.3) — blocks `AvailabilityHint` and `CodeDisplay` token-clean shipping.
2. **`@camp404/core`** stood up (`architecture.md` Phase 1) with `generateInviteCode`, `isSyntacticallyValidCode`, `CODE_RULES_HINT`, `CODE_PATTERN`, `INVITE_CODE_MIN/MAX` moved/added (`service-layer/02-invites.md` step 1).
3. **Leaf components shipped:** `InputField` (`molecule-inputfield.md`), `Alert` (`molecule-alert.md`), `CodeDisplay` (`molecule-codedisplay.md`), `Stepper` (`molecule-stepper.md`), `AvailabilityHint` + its `types.ts` (`molecule-availabilityhint.md`), `Textarea`/`Checkbox`/`Button`/`Card` atoms (REUSE).
4. **Service layer:** `createInviteAction` re-pointed to core imports; check route's prod/test existence semantics reconciled (`service-layer/02-invites.md` steps 2 & 4).

**Ordered steps:**

1. **Extract the `Availability` type + `AvailabilityHint` into their own files** (`types.ts`, `availability-hint.tsx`) per `molecule-availabilityhint.md` steps 1–3. Update the call-site import.
   - *Acceptance:* `invite-form.tsx` no longer defines `Availability` or the private hint; typecheck + lint pass; `available` renders `text-success` (no `emerald-400`); hint has `role="status" aria-live="polite"`.
   - *Tests:* the eleven `availability-hint.test.tsx` cases (owned by the leaf plan).

2. **Re-point pure-logic imports to `@camp404/core`** — `generateInviteCode`, `isSyntacticallyValidCode`, and replace the hardcoded `"3–48 chars, …"` invalid-hint with `CODE_RULES_HINT` (single-source, S14 OQ #3).
   - *Acceptance:* grep shows one literal definition of the rule text; client hint === server hint; no `@/lib/invite-words` import remains in the form.

3. **Replace the email + note + code-label pairs with `InputField`** (email gets the `multiUse` label/required flip; note stays a labelled `Textarea`).
   - *Acceptance:* no inline `<div className="space-y-2"><Label …><Input>` shell remains; `getByLabelText` resolves email/code; required flip works on `multiUse`.

4. **Replace the code row + success CodeBox with `CodeDisplay`** (`editable-shuffle` for the row with `onChange` lowercasing + `onShuffle` re-roll; `readonly-copy` for the SuccessPanel).
   - *Acceptance:* no `font-mono text-lg` CodeBox or separate Shuffle `Button` remains; copy "Copied" flip works and the timer is cancelled on unmount (no act-warning).

5. **Replace the bare number input with `Stepper`** inside `CaptainOptions` (real number value, `[1,100]` clamp, −/+ buttons; keep keyboard entry).
   - *Acceptance:* −/+ mutate `maxUses` and clamp at bounds; `multiUse` still flips the email label/required and the helper copy; the posted `maxUses` field is still a valid integer string.

6. **Render `MemberNote` and the server-error banner as `Alert`** — `MemberNote` = `variant="info"` (`info` icon, muted, member-only); server error = `variant="destructive" role="alert"`.
   - *Acceptance:* member variant shows the info-icon row (the new branch); server error renders via `Alert` (no hand-rolled `<p>`); banner appears only when `result && !result.ok`.

7. **Reconcile card treatment + container** — card both form and success (S14 OQ #1); confirm `max-w-xl` vs `max-w-lg` (OQ #5).
   - *Acceptance:* both states are carded consistently; container decision recorded.

8. **Verify the whole organism end-to-end** — member happy path, captain happy path (pre-approve + stepper), re-roll/edit availability gating, server-error preserves typed code, success swap + copy + send-another.
   - *Acceptance:* all S14 §States rows render correctly; the existing E2E `invite-tracking.spec.ts` (provenance) stays green.
   - *Tests:* component-level RTL on `invite-form.tsx` (member vs captain rendering, availability → CreateBtn disabled matrix, success swap, server-error banner); plus the service-layer action invariant tests (member/captain, crafted-POST ignored, `assigned_rank=NULL`) owned by `service-layer/02-invites.md` step 6.

**Out of scope for this component (flagged for the surface pass):** stale Tools-hub "single-use" copy + S03 `CAMP-XXXX-XXXX` placeholder (OQ #7); the onboarding-gate question (OQ #2); optional 7-day expiry on mint (service-layer step 5, product-gated); check-route prod/test existence semantics (OQ #4, service-layer step 4).

---

## Consumers — which surfaces mount it

| Consumer | Surface | Route | File | Mount |
|---|---|---|---|---|
| `InviteToolPage` (server) | **S14 Invite tool** (`design/spec/surfaces/11-invite-tool.md`) | `/tools/invite` | `apps/web/app/tools/invite/page.tsx:29` | `<InviteForm isCaptain={campUser.rank === "captain"} />` after auth + invite-gate + approval-gate pass. |

Single consumer. Entry is the Tools hub (`/tools`, S13) → "Invite a member" card → `/tools/invite`. No other surface mounts `InviteForm`; the redemption-side twin (`InviteGateForm` at `/signup/required`, S03) is a **separate** organism, not this one.
