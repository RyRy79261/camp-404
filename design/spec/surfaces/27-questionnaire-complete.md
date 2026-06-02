# Questionnaire complete & queue — functional brief

- **Route(s):** `/onboarding/questionnaire/complete` (implied destination after successful questionnaire submission; exact route TBD — see Open questions)
- **Canonical board(s):** `S27 Questionnaire complete & queue` (board #36, 430×-, `design/.spec-extract/boards/36-s27-questionnaire-complete-queue.txt`)
- **Superseded / dropped:** none — sole board for this surface; no alternate iterations exist
- **Breakpoints:** mobile-first 430px (board canonical size); full-width at wider viewports (same `$background` fill, centred column, `max-w-[430px]` or global container constraint)

---

## Purpose

The landing point immediately after a user successfully completes one required questionnaire. It does two jobs in sequence:

1. **Success acknowledgement** — a hero confirms the just-completed questionnaire is logged. Two variants: "All done" (every blocking questionnaire satisfied) and "More required" (at least one pending questionnaire remains in the queue).
2. **Sequential unlock queue** — a visible list of ALL required questionnaires in submission order (Safety / Dietary / Agreements), showing which are complete, which is next, and which are locked until a prior one is finished. The queue reinforces that the app remains gated until every row is satisfied and provides a direct CTA into the next pending questionnaire.

This surface is part of the S25 → S26 → S27 onboarding loop for captain-activated questionnaires. The burner-profile onboarding wizard (unit 04) currently redirects server-side to `/` on completion; S27 is the analogous confirmation surface for the subsequent questionnaire trio (Safety, Dietary, Agreements). Treating S27 as a distinct route (rather than a wizard-internal state) enables the queue to show cross-questionnaire status and to serve as an entry point from the gating spine when multiple blocking actions exist.

**Scope-expansion flag:** the multi-questionnaire sequential queue (Safety / Dietary / Agreements as separate blocking questionnaires) is not yet seeded in the live codebase. The existing `required_actions` + `questionnaire_activations` engine fully supports it — no schema change is required; this is app-level sequencing logic. Confirm with the team before building.

---

## Layout & modules

Single-column vertical stack, `width: 430px / fill`, `gap: 24px`, `padding: 24px`, `fill: $background`. Two labelled sections separated by a divider, with a footer beneath the queue list.

### Section A — Completion success hero

Vertically centred column (`gap: 14px`, `padding: [8,0]`, `align-items: center`).

- **Check icon badge** — 88×88px circle, fill `#00dcff24` ($accent tint), containing a Lucide `check` icon in `$accent`. Communicates success without using the global destructive/warning palette.
- **Heading** — "Questionnaire complete" (`Inter / 22px / 700 / $foreground`).
- **Sub-heading** — "Thanks — that's logged with the captains." (`Inter / 14px / normal / $muted-foreground`).
- **Variant slot** (`gap: 8px`, `padding: [16,0,0,0]`, `align-items: center`) — renders exactly one of two variants (see States):
  - *All done variant:* `Button-Primary` "Back to camp" (full width) + caption "You're all caught up." (`Inter / 12px / normal / $muted-foreground`).
  - *More required variant:* count line "N more required before you're unlocked" (`Inter / 13px / 600 / $foreground`) + `Button-Primary` "Start next questionnaire" (full width).

### Divider

1px horizontal rule, `fill: $border`, `width: fill`.

### Section B — Required queue

**Queue header** (`gap: 6px`):
- Label "SECTION B — REQUIRED QUEUE" (`Inter / 11px / 700 / $muted-foreground`)
- Heading "Finish these to unlock the app" (`Inter / 20px / 700 / $foreground`)
- Sub-heading "A captain needs all of these from you." (`Inter / 13px / normal / $muted-foreground`)

**Queue list** — a vertical stack (`gap: 12px`) of one `Card` per required questionnaire, rendered in submission order (Safety → Dietary → Agreements). Each card communicates its own status via content and visual treatment (see Queue Card states below). The board shows three rows; the implementation must derive count and ordering from the live `required_actions` dataset.

**Queue footer** (`gap: 14px`, `padding: [4,0,0,0]`, `align-items: center`):
- Warning copy "You can't use Camp 404 until every required questionnaire is done." (`Inter / 12px / normal / $muted-foreground`)
- **Sign out link** — tappable area (`padding: [8,12]`, centred), label "Sign out" (`Inter / 14px / 600 / $muted-foreground`). Navigates to `/auth/sign-out`. Always visible — escape hatch for a wrong-account situation.

---

## Components used

| Component | Role | Key props / variants |
|---|---|---|
| `Button-Primary` (`packages/ui/src/components/button.tsx`, `variant="default"`) | Primary CTA in hero — "Back to camp" (all-done) or "Start next questionnaire" (more required) | `w-full`; label driven by variant |
| `Card` (`packages/ui/src/components/card.tsx`) | Container for each queue row (Safety, Dietary, Agreements) | `w-full`; opacity modifier `op: 0.55` on locked rows (see below) |

**New components introduced by this surface:**

- `QueueCard` (new, local to this surface or extractable) — a `Card` specialisation that renders a queue row: title, status badge/icon, and contextual action affordance. Needs to display three visual states: complete, next-up (actionable), and locked (opacity 0.55, inert). Not among the 10 canvas reusables; introduce as a local component.
- `CompletionHero` (new, local) — the Section A hero block including the icon badge, heading, sub-heading, and variant slot. Stateless; variant driven by a prop.

No `TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, `EmptyState`, or `CaptainLock` components are used on this surface.

---

## States

### Global state matrix

| State | Behaviour |
|---|---|
| **Loading** | Server component fetches the user's `required_actions` rows before first paint. No client spinner; page renders with data already resolved. |
| **Populated — all done** | Hero shows "All done" variant; CTA is "Back to camp" → `/`. Queue list shows all cards as complete (all rows `status = completed`). |
| **Populated — more required** | Hero shows "More required" variant with count of remaining pending actions; CTA is "Start next questionnaire" → the next pending questionnaire's gate (S25 runner for that questionnaire key). Queue shows: first pending card as next-up, subsequent pending cards as locked. |
| **Empty (no required actions)** | Treat as all-done; same as "all done" variant. Edge case: a user lands here but has zero blocking required_actions rows (e.g. a god account or all waived). Show "Back to camp". |
| **Validation error** | Not applicable — no form on this surface. |
| **Submitting / pending** | Not applicable — no write action on this surface; all navigation is plain anchor/router push. |
| **Success** | This surface IS the success state following a questionnaire submit; it has no further in-surface success presentation. |
| **Disabled** | No controls are disabled on the surface itself. Locked queue cards are visually muted (`opacity: 0.55`) and their affordances are inert, not `disabled` in the HTML sense. |
| **Invite-gated** | The upstream gate (`hasCampAccess`) must be satisfied before reaching here; not re-enforced on this surface. If a user somehow arrives without access, redirect to `/signup/required` (defence-in-depth; same pattern as onboarding action). |
| **Onboarding-incomplete** | A user who has not completed the burner-profile questionnaire (`burner_profile` required_action still `pending`) should not reach S27 — the gating spine routes them to S26 for their burner profile first. S27 is entered only after the burner-profile gate is satisfied and a subsequent captain-activated questionnaire is being completed. |
| **Pending / rejected approval** | After the queue is fully satisfied the CTA routes to `/` which re-enters the gating spine; `pending`→`/pending-approval`, `rejected`→ terminal. This surface does not itself check `approval_status`. |
| **Captain-locked (preview-but-locked, decision #3)** | N/A — this surface is per-user self-service onboarding; no rank-gated content. |

### Queue card states

| State | Visual treatment | Board evidence |
|---|---|---|
| **Complete** | Full opacity; status icon `check` ($accent); title + "Done" or `completedAt` label. | Board rows "Row Safety" and "Row Dietary" shown at full opacity. |
| **Next-up (actionable)** | Full opacity; primary/accent affordance; "Start" / "Continue" CTA within card or card is tappable. | Implied by "More Required" variant CTA — the next pending row is the target. |
| **Locked** | `opacity: 0.55`; no interactive affordance; lock icon or greyed label. | Board "Row Agreements" at `op: 0.55`. |

The board shows exactly three queue rows (Safety, Dietary, Agreements). The live implementation must derive the list and ordering from `required_actions` rows for the signed-in user, filtered to `type = questionnaire` and not `actionKey = burner_profile`. Display order should follow `createdAt` ascending (or a captain-defined ordering if that field is ever added to `questionnaire_activations`).

---

## User actions

| Action | Result |
|---|---|
| Tap "Back to camp" (all-done variant) | Navigate to `/` (home). |
| Tap "Start next questionnaire" (more-required variant) | Navigate to the gate screen (S25-equivalent) for the next pending questionnaire, e.g. `/onboarding/questionnaire/safety` (exact route TBD). |
| Tap a "next-up" queue card (if card is itself tappable) | Same destination as "Start next questionnaire" CTA — the gate for that questionnaire key. |
| Tap a complete queue card | No action; card is non-interactive (or navigates to a replay/review view if the replay flow — unit 12 — supports the questionnaire key; out of scope for this brief). |
| Tap a locked queue card | No action; card is inert. |
| Tap "Sign out" | Navigate to `/auth/sign-out`. Session ends; user returns to landing. |

---

## Data & enums

### Read path

| Field / table | Usage |
|---|---|
| `required_actions.user_id` | Filter to the signed-in user. |
| `required_actions.type` | Filter to `'questionnaire'` rows only. |
| `required_actions.action_key` | Identify which questionnaire each row covers; exclude `'burner_profile'`. |
| `required_actions.title` | Display name for each queue card (e.g. "Safety & logistics"). |
| `required_actions.status` | `'pending'` → incomplete; `'completed'` → done; `'waived'` → treat as done for queue display; `'expired'` → captain decision needed (surface as "Expired" label, non-blocking for the queue display but note to captain). |
| `required_actions.blocking` | Only `blocking = true` rows contribute to the "N more required" count and the locked/next-up queue rendering. Non-blocking rows shown in the queue but not counted in the hero. |
| `required_actions.completed_at` | Optional timestamp to show on complete cards ("Done 3 May"). |
| `required_actions.due_at` | Optional "Due by" label on pending/next-up cards. |

### Enums referenced (from `schema.ts`)

| Enum | Values used |
|---|---|
| `requiredActionTypeEnum` | `questionnaire` — filter; `acknowledgement` / `payment` / `profile_update` not displayed here. |
| `requiredActionStatusEnum` | `pending`, `completed`, `waived`, `expired` — drive queue card state. |

### Write path

None. This surface is read-only.

### NEW schema

**None.** The multi-questionnaire queue is expressed entirely via existing `required_actions` rows (one per user per questionnaire activation). Sequential unlock is app logic: the surface marks the first `pending` row as "next-up" and all subsequent `pending` rows as "locked". No new tables, columns, or enums are required.

---

## Validation & edge cases

- **Zero blocking required_actions rows** — show "All done" / "Back to camp". Do not crash or show an empty queue.
- **Only one required questionnaire** — queue renders one card (complete); hero shows "All done". The board's three-row layout is the representative example, not a hard constraint.
- **All rows complete / waived** — "All done" variant; "Back to camp" CTA.
- **Expired row** — `status = 'expired'` means the activation window closed without the user completing it. Treat as a distinct card state (not complete, not next-up, not locked): label "Expired — contact a captain". Do not count toward the blocking total or render it as "next-up". This state is not explicitly shown on the board; add it defensively.
- **Non-blocking rows** — `blocking = false` required_actions: show in the queue (for visibility) but exclude from the hero's "N more required" count and from determining "All done" vs "More required". A non-blocking pending row never keeps the user from reaching the home screen.
- **Re-entry after full completion** — if a user navigates directly to this route after all queues are satisfied, show the "All done" variant. The gating spine should redirect completed users to `/` rather than this route, but the route itself must handle it gracefully.
- **Auth lost mid-session** — if the session expires before the page loads, redirect to `/auth/sign-in` (server-side; same pattern as onboarding wizard).
- **Ordering of queue rows** — if `questionnaire_activations` does not define an explicit sequence order, fall back to `required_actions.created_at ASC`. The board's ordering (Safety → Dietary → Agreements) is the canonical intended sequence; ensure the seed / activation flow creates rows in this order.

---

## Flows

```
[S26 questionnaire runner — final submit succeeds]
  → server action satisfies required_action row (status = completed)
  → redirect to /onboarding/questionnaire/complete (S27, this surface)

[S27 loads — server]
  → auth gate (redirect to /auth/sign-in if no session)
  → load required_actions for user (type = questionnaire, blocking = true)
  → compute: allDone = all rows completed/waived; pendingCount = count of pending rows
  → render: allDone → "All done" variant; else → "More required" variant + pendingCount

[All done variant]
  → user taps "Back to camp"
  → navigate to /
  → gating spine: if approval pending → /pending-approval; else home dashboard

[More required variant]
  → user taps "Start next questionnaire"
  → navigate to gate (S25) for next pending questionnaire
  → S25 → S26 runner → S27 (loop until all done)

[Any state]
  → user taps "Sign out"
  → navigate to /auth/sign-out → session cleared → Landing (S01)
```

---

## Divergences from feature-set reference

| Feature-set signal (`04-onboarding-wizard.md`) | Board S27 / live code | Resolution |
|---|---|---|
| Onboarding wizard (`saveBurnerProfile`) redirects server-side to `/` immediately on `final=true`; there is no client-side success screen for the burner-profile questionnaire. | S27 is a distinct surface positioned after subsequent captain-activated questionnaires (Safety, Dietary, Agreements), not after the burner-profile wizard. The board's queue rows are Safety / Dietary / Agreements — not the burner-profile pages. | S27 is NOT the completion screen for the burner-profile onboarding wizard (unit 04). It is the completion and queue surface for subsequent required questionnaires activated by a captain. No change to the unit-04 redirect-to-`/` flow. No divergence; different entry points. |
| Feature-set reference unit 04 covers a single questionnaire; it does not describe multi-questionnaire sequencing. | S27 board explicitly shows three required questionnaires in a queue, introducing a multi-questionnaire sequential-unlock concept. | **Scope expansion** (confirmed in decisions.md carry-forward): the trio is expressible via `required_actions` with no schema change; sequential unlock is app logic. Flag to team to confirm that Safety, Dietary, and Agreements questionnaires will each be seeded as `questionnaire_activations` with `blocking = true` targeting `scope = 'everyone'`. |
| Feature-set has no specification for this completion/queue surface at all. | Board is the sole source of truth for S27. | Board wins. No reference contract conflict. |

---

## Open questions / build reconciliations

1. **Route definition** — the board implies a dedicated route; `/onboarding/questionnaire/complete` is proposed. Confirm the exact path and whether it is shared (one route, driven by query param for which questionnaire just completed) or per-questionnaire (`/onboarding/questionnaire/safety/complete`, etc.). The single shared route is preferred since the queue always shows all questionnaires.

2. **Questionnaire keys and seed** — Safety, Dietary, and Agreements are named on the board but no live `questionnaire_activations` seed exists for them. Confirm the `questionnaireKey` values, the `title` strings, and whether they will be seeded as permanent "always open" activations or captain-triggered activations. The queue display logic depends on this.

3. **Queue card content spec** — the board shows `Card` instances labelled "Row Safety", "Row Dietary", "Row Agreements" without drilling into card-internal layout. Each card needs: title (from `required_actions.title`), status indicator (done / next-up / locked), optional due date, and a tappable affordance for the next-up card. A `QueueCard` sub-component spec is needed before build.

4. **Sequential vs parallel unlock logic** — the board shows Agreements at `opacity: 0.55` (locked), implying Dietary must be completed before Agreements unlocks. Confirm whether this is strict sequential (complete row N before row N+1 becomes available) or parallel-with-one-highlighted (all pending simultaneously, but the UI highlights "Start next" in creation order). Implementation of the lock state depends on this decision.

5. **Expired row treatment** — the `requiredActionStatusEnum` includes `'expired'` but the board does not show it. Confirm how expired queue items should appear (suggested: greyed card, "Expired — contact a captain" label, not counted in pending total).

6. **Burner-profile completion flow gap** — the existing burner-profile wizard redirects to `/` immediately on success (unit 04). If Safety/Dietary/Agreements questionnaires are also blocking, the gating spine at `/` will immediately route the user to the next required questionnaire's gate (S25). There is no "you just finished your burner profile, here's what's next" moment. Consider whether the burner-profile wizard final submit should also redirect to S27 (showing the subsequent queue) rather than home, to create a continuous onboarding flow. Raise with product.

7. **"N more required" count wording** — the board shows "1 more required before you're unlocked" but does not specify the plural form or the exact sentence for N > 1. Confirm copy for N = 2 and N = 3 (e.g. "2 more required before you're unlocked").

8. **Non-blocking questionnaire display** — if a non-blocking questionnaire exists in `required_actions`, should S27 show it in the queue? The board only shows blocking-required items. Recommendation: only display blocking questionnaires here; non-blocking can appear elsewhere (e.g. "My forms" / S15). Confirm.
