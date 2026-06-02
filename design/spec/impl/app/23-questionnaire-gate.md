# 23-questionnaire-gate — app integration plan

- Route(s): `/onboarding/questionnaire` (intro) · routed page

> Scope: the **pre-wizard interstitial** rendered at `/onboarding/questionnaire` before
> the wizard starts. This is a **NEW surface** that does not exist today — the current
> route at that path renders `QuestionnaireWizard` directly, with no gate screen.
> The redesign inserts this interstitial between the gating spine's redirect and the
> wizard proper. Plan docs only; no code in this pass.
>
> Classification: **NEW** (gate interstitial page). The existing `page.tsx` becomes the
> host for the wizard (surface 04-onboarding-wizard); this surface either shares that
> route with a query-param toggle or occupies a sub-route (open question D17). The
> gate carries NO form input, performs NO writes, and has no rank-gated content —
> `CaptainLock` is **not used** here. Gating is auth + invite + completion only
> (server redirects before first paint). The board (S25 `34-s25-questionnaire-gate.txt`)
> is canonical; the feature-set reference (`04-onboarding-wizard.md`) has no gate screen
> and is superseded for this surface.

---

## Current state — the existing route/files today

Verified against the live tree (every path cited below was read in full):

- **`apps/web/app/onboarding/questionnaire/page.tsx`** (60 lines) — the current
  **server component** with `export const dynamic = "force-dynamic"` (`:16`). Runs
  the gating spine inline — `getAuthenticatedUserOrRedirect()` (`:19`) →
  `ensureCampUser(authUser)` (`:20`) → `hasCampAccess(campUser, authUser.primaryEmail)`
  else `redirect("/signup/required")` (`:21–23`) → `getBurnerProfile(campUser.id)`
  → `profile?.completedAt` else `redirect("/")` (`:26–28`) → ID pre-fill via
  `getIdDocuments` + `mergeIdNumber` (`:33–40`) → renders chrome header
  `"Build your burner profile"` and mounts `<QuestionnaireWizard>` directly (`:43–57`).
  **There is no gate interstitial today.** The route goes straight to the wizard.

- **`apps/web/app/onboarding/questionnaire/actions.ts`** (99 lines) — `"use server"`
  `saveBurnerProfile(rawResponses, final)`. Belongs to the wizard/runner (surface 04);
  not changed by this gate surface.

- **`apps/web/app/onboarding/questionnaire/actions.test.ts`** (83 lines) — unit test
  for the `saveBurnerProfile` persistence-error path. Belongs to surface 04; untouched
  by this gate surface.

- **`apps/web/lib/users.ts`** — `getBurnerProfile` (`:162`), `hasCampAccess` (`:219`),
  `ensureCampUser` (`:60`), and gate helpers (`:192–212`). The gate reads
  `profile?.completedAt` from `getBurnerProfile` server-side before first paint; no
  writes on this surface.

- **`apps/web/lib/required-actions.ts`** — `ACTION_ROUTES` maps `burner_profile` →
  `/onboarding/questionnaire` (`:7–11`); `nextGate` (`:23`) is what the gating spine
  uses to route an incomplete user here. The existing route IS the `burner_profile` gate
  target; this remains true after the interstitial is inserted.

- **No `onboarding/` layout, error, or not-found files today.** The root
  `apps/web/app/layout.tsx` (51+ lines) wraps all routes via `Providers`,
  `AcknowledgementGate`, and `FeedbackGate`.

**What the redesign changes:** the current `page.tsx` is the wizard host (surface 04).
This gate surface **inserts a distinct full-screen interstitial** between the gating
spine's redirect and the wizard. The interstitial renders S25's layout (icon badge,
eyebrow, heading, subhead, `QCard`, "Start questionnaire" CTA, lock notice, sign-out
link) as a pure read-only server component. The routing split between gate and wizard
(query param vs sub-route) is open question D17; this plan assumes the gate lives at
`/onboarding/questionnaire` (root) and the wizard advances to it via a query param
`?start=1` or a sub-route `/onboarding/questionnaire/wizard` — see §Open items.

---

## File structure — target files in apps/web

| File | vs current | Classification | Notes |
|---|---|---|---|
| `apps/web/app/onboarding/questionnaire/page.tsx` | MODIFY | **EXTEND** | Split the current monolithic server component into a gate/wizard toggle. Today: renders wizard. After: if not `?start=1` (or the route-split equivalent), render the gate interstitial (S25 UI). The gate branch still runs the full auth+invite+completion check and redirects as today; it then renders the static interstitial instead of mounting the wizard. The `?start=1` / wizard sub-route branch hands off to the wizard (surface 04). |
| `apps/web/app/onboarding/questionnaire/gate.tsx` | CREATE | **NEW** | Optional server-component extract for the gate UI — the full S25 layout: scan overlay, icon badge, eyebrow, heading, subhead, `QCard`, "Start questionnaire" button, lock notice, "Sign out" link. Keeping this in a separate file from `page.tsx` simplifies the split and avoids a 200-line monolith. Whether this is inline in `page.tsx` or a separate file is an eng call; plan for separate for readability. |
| `apps/web/app/onboarding/questionnaire/actions.ts` | REUSE | REUSE | `saveBurnerProfile` — belongs to surface 04 (wizard). Not changed by this gate surface. |
| `apps/web/app/onboarding/questionnaire/actions.test.ts` | REUSE | REUSE | Belongs to surface 04. Not changed by this gate surface. |
| `apps/web/app/onboarding/questionnaire/layout.tsx` | **NONE** | — | Not present today; not required. The gate is full-screen (own `min-h-[100dvh]`) and does not need an additional layout wrapper. |
| `apps/web/app/onboarding/questionnaire/error.tsx` | **NONE** | — | Not present today; not required. The gate has no writes, no async client state, and no error states beyond server-redirect guards. |
| `apps/web/app/onboarding/questionnaire/not-found.tsx` | **NONE** | — | Not present today; not required. |
| `apps/web/app/onboarding/questionnaire/page.test.ts` | CREATE (optional) | **NEW** | Gate-branch unit test: verify that when `profile.completedAt` is set, the server path redirects to `/`; when invite check fails, redirects to `/signup/required`; when neither, the gate UI renders (or, via E2E, the CTA navigates to the wizard). Not blocking for the gate build itself. |

**Routing note (pending D17):** if the decision is a sub-route (`/onboarding/questionnaire/wizard`
instead of a query-param toggle), the `wizard/` sub-segment would be a new directory
under `onboarding/questionnaire/`. In that case `page.tsx` remains the gate-only server
component and `wizard/page.tsx` is the wizard host (currently in `page.tsx`). The query-param
path keeps a single `page.tsx` with a conditional branch. Either way the gate content
belongs to `page.tsx` (or `gate.tsx` sub-extract) and the wizard content belongs to the
existing wizard host path. See §Open items item 1.

---

## Components composed

The gate renders a static full-screen layout. No TopChrome, no wizard chrome, no
ProgressBar. Components are composed server-side (no "use client" island required);
the only interactive element (the "Start questionnaire" button) is a standard anchor/link
navigation — no async action needed.

| Component | Plan | Rendered by | Server / client | Notes |
|---|---|---|---|---|
| **IconBadge** | `components/atom-iconbadge.md` | gate page (server) | server-rendered | 60×60 `size="lg"` `shape="circle"` `tone="primary"` — renders the clipboard-list icon circle (S25 `ic` frame: 60×60 `r:999 fill:#ff008c2e` → `primary/18%`). `atom-iconbadge.md` plans PROMOTE from multiple hand-rolls; maps the S25 60px element to `size="lg"`. Prerequisite: `IconBadge` must be built before this surface can ship. |
| **Button (Primary)** | `components/atom-button.md` | gate page (server) | server-rendered | Full-width "Start questionnaire" CTA. `variant="default"` (primary). REUSE — `Button` already exists in `@camp404/ui/components/button`. The "Start questionnaire" button is a navigation link, not a server action; render as `<Button asChild><Link href="…wizard-route…">Start questionnaire</Link></Button>`. |
| **QCard** | `components/molecule-qcard.md` | gate page (server) | server-rendered | `size="default"` (S25 pad:16 gap:10 title:16px). Props: `title="Safety & logistics"` `questionCount={8}` `estimatedMinutes={3}` — static strings for the initial build per surface brief §Validation & edge cases and open question A8/D17. NEW component (`molecule-qcard.md` §Current state: does not exist). Prerequisite: `QCard` must be built before this surface can ship. |
| **Lucide `lock`** | — (direct import) | gate page (server) | server-rendered | 12px icon in the lock-notice row. Plain `<Lock className="size-3 text-muted-foreground" aria-hidden="true" />` — does not need `IconBadge` (not a circled badge; the spec draws it as a bare inline icon next to copy text). |
| **Lucide `clipboard-list`** | — (inside IconBadge) | IconBadge | server-rendered | Passed as the `icon` prop to `IconBadge`. |

**No `CaptainLock`** — the surface brief (`23-questionnaire-gate.md §States`) is explicit:
"Captain-only-locked: N/A — no rank-gated content; questionnaire is per-member, not
rank-scoped. `CaptainLock` is not used here."

**No `QuestionnaireWizard`** — the gate is the pre-wizard interstitial; the wizard is
surface 04 and mounts on the route after the user taps the CTA.

**Client islands:** none. The gate has no form input, no async writes, and no client
state. The "Sign out" link is `<a href="/auth/sign-out">` (plain anchor). The "Start
questionnaire" CTA is a `<Link>` navigation. Both are server-rendered. No `"use client"`
directive is needed on `gate.tsx`.

---

## Services & data

All reads run **server-side in `page.tsx`** before first paint. The gate performs no
writes and exposes nothing to the client beyond the rendered HTML.

**Fetched server-side (gate branch of `page.tsx`):**

| Call | Module | Purpose | Post-extraction target |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts` | Auth gate: redirect to `/auth/sign-in` if unauthenticated. Next-coupled; stays in `apps/web/lib`. | REUSE — same call as today. |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts` (`:60`) | Session → row resolution; god auto-create. Test-mode-routed; stays in `apps/web/lib`. | REUSE. |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts` (`:219`) | Invite gate: redirect to `/signup/required` if no camp access. Becomes a thin shim over `core.hasCampAccess(user, isGodEmail(email))` after plan 01 Step 3 extraction; call-site unchanged. | REUSE / thin shim post-extraction. |
| `getBurnerProfile(campUser.id)` | `apps/web/lib/users.ts` (`:162`) | Completion gate: redirect to `/` if `profile.completedAt` is set. Returns `BurnerProfileSummary { completedAt, responses, updatedAt, version }`. | REUSE. |
| `getPendingRequiredActions(campUser.id)` | `apps/web/lib/users.ts` (`:212`) | (Optional defence) Re-check that a blocking `burner_profile` action is still pending before rendering the gate, avoiding a flash of the gate for a just-completed user who bypasses the `completedAt` check. The spine uses this upstream; the gate can skip re-querying if `!profile?.completedAt` is already the guard. Omit in the initial build unless the defence gap is flagged. | REUSE if used. |

**NOT fetched on this surface:**
- `getIdDocuments` — the gate is a static interstitial; it does not pre-fill wizard
  responses. The ID decrypt happens in the wizard host (surface 04), not here.
- `QUESTIONNAIRE` catalogue — QCard copy is static strings in the initial build (open
  question A8). Even if eventually parameterised, the catalogue is read by the wizard
  host, not the gate interstitial.
- Any write function — the gate performs zero mutations.

**Passed as props to rendered components:**
- `QCard`: `title="Safety & logistics"` `questionCount={8}` `estimatedMinutes={3}` —
  hard-coded static strings, matching S25 board exactly. These are a content decision
  pending questionnaire-trio scope confirmation (open question A2/A8); they must not be
  silently reconciled to the live burner-profile catalogue's 12 pages.
- `IconBadge`: `icon={ClipboardList}` `size="lg"` `shape="circle"` `tone="primary"`.
- `Button` (Start CTA): `asChild` with `href` pointing to the wizard route (D17 pending).
- `<a href="/auth/sign-out">` — plain anchor; no session data needed.

**Server action:** none. This surface owns no server action. (`saveBurnerProfile` in
`actions.ts` belongs to the wizard, surface 04.)

**API route handlers:** none. This surface owns no API handler.

**`@camp404/core` usage:** none on the gate itself for the initial build. After plan 01
Step 3 extraction, `hasCampAccess` becomes a thin shim that calls `core.hasCampAccess` —
the call-site in `page.tsx` is unchanged.

---

## Gating

**Gate level:** auth + invite + completion. **No rank gate.** `CaptainLock` is not used.

| Check | Location | Pass → | Fail → |
|---|---|---|---|
| Auth (`getAuthenticatedUserOrRedirect`) | `page.tsx` server, before render | Continue | `redirect("/auth/sign-in")` — built-in, never reaches gate UI. |
| Invite (`hasCampAccess`) | `page.tsx` server | Continue | `redirect("/signup/required")` — G1 gate. |
| Completion (`profile?.completedAt`) | `page.tsx` server | Continue | `redirect("/")` — G2b already-done. |
| `required_actions` status | gating spine (`app/page.tsx:47`) upstream | Routes here via `nextGate(...)` | — (already handled before this route is reached). |

All checks match the current `page.tsx` gate logic (`:19–28`). No new checks are
introduced by this surface; the gate merely **adds the S25 interstitial UI** as what the
user sees when all checks pass instead of the wizard direct-mount.

**Preview-but-locked:** NOT applicable. The surface brief confirms "CaptainLock is not
used here" and "Captain-only-locked: N/A." No rank clearance is required, no content is
withheld from members, and no `requireClearance` call is needed.

---

## States

| State | What happens | Source |
|---|---|---|
| **Default / ready** | All gate checks pass; the S25 interstitial renders with all content visible, CTA active. This is the only client-visible state — the gate has no form, no async writes. | Brief §States: "Default / ready — This is the only interactive state." |
| **Loading (server-side)** | RSC streaming; no client spinner. Server checks run before first paint. The root layout's `Providers` / `AcknowledgementGate` wrap streams in the usual Next App Router shell. | Brief §States: "Loading (server) — no client spinner." |
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` redirects to `/auth/sign-in` before the gate renders. User never sees the interstitial. | Brief §States: "Invite-gated" / §Validation: "Unauthenticated: redirect to /auth/sign-in." |
| **Invite-gated (no camp access)** | `hasCampAccess` false → server `redirect("/signup/required")`. User never sees the interstitial. | Brief §States: "Invite-gated: hasCampAccess false → server redirects to /signup/required." |
| **Already-complete** | `profile.completedAt` set → server `redirect("/")` before first paint. Re-entry after finishing the questionnaire bounces home. | Brief §States: "Already-complete: profile.completedAt is set → server redirects to /." |
| **Pending-approval / rejected** | Checked upstream by the gating spine (`app/page.tsx:61`) before routing here; the `isApproved` check fires after `nextGate`. This surface does not inspect `approvalStatusEnum` directly. | Brief §States: "Pending-approval / rejected — Approval status is checked by the gating spine, not this surface." |
| **No-data (offline / action error)** | Gate is a static presentation screen with no client data fetches. No error state beyond the server-side redirect guards. If the server render itself errors (e.g., DB unreachable), Next's root `error.tsx` catches it (no segment-level `error.tsx` needed). | Brief §States: "No-data … This is a static presentation screen with no data fetches visible to the client." |
| **CTA tapped ("Start questionnaire")** | Client-side navigation to the wizard route. No async work; no loading spinner on the gate. The transition to the wizard is a full Next navigation. | Brief §Actions: "Navigate to the wizard at /onboarding/questionnaire with pageIndex = 0." |
| **Sign out tapped** | Full-page navigation to `/auth/sign-out` via the plain `<a>` tag. No confirmation dialog. | Brief §Actions: "Navigate to /auth/sign-out. No confirmation dialog." |

---

## Build steps

Ordered with prerequisites (what must land first) and acceptance criteria.

### Step 0 — Prerequisites (must land before this surface can be built)

The gate cannot ship until these are ready:

1. **Foundations / token codemod** (`design/spec/impl/foundations-tokens.md` Phase 0)
   — `--radius`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`,
   `bg-primary/18` alpha utility, font wiring. All are used by `QCard` and `IconBadge`.
   *Acceptance:* `pnpm build --filter @camp404/ui` passes; token utilities resolve.

2. **`IconBadge` built and exported** (`components/atom-iconbadge.md`) — the 60×60
   `size="lg"` `shape="circle"` `tone="primary"` icon circle used at the top of the
   gate. `atom-iconbadge.md` §Build steps Step 1–3.
   *Acceptance:* `import { IconBadge } from "@camp404/ui"` resolves in `apps/web`.

3. **`QCard` built and exported** (`components/molecule-qcard.md`) — the questionnaire
   summary card. `molecule-qcard.md` §Build steps Step 1–3.
   *Acceptance:* `import { QCard } from "@camp404/ui"` resolves; size="default" renders
   with `pad:16 gap:10 title:16px` per the S25 density.

4. **Routing decision D17 locked** — gate at root `/onboarding/questionnaire` with query
   param `?start=1`, or gate at root and wizard at sub-route
   `/onboarding/questionnaire/wizard`? The build depends on knowing whether `page.tsx`
   receives a toggle branch or the gate lives in isolation. See §Open items item 1.
   *Acceptance:* `open-questions.md` D17 marked resolved; routing pattern documented.

### Step 1 — Implement the gate UI in `apps/web`

**Files touched:** `apps/web/app/onboarding/questionnaire/page.tsx` (EXTEND) + optional
`apps/web/app/onboarding/questionnaire/gate.tsx` (CREATE).

**What to build:**

- Extract the gate body into `gate.tsx` as a server component (no `"use client"`):
  - Outer: `<main className="relative min-h-[100dvh] flex flex-col">`.
  - Scan overlay: `<div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "#00dcff08" }} />` (the `fill: #00dcff08` scan atmosphere from S25).
  - Content column: `<div className="flex flex-col items-center justify-center gap-4 px-7 py-0 h-full flex-1">` (S25 `gap:16 pad:28 ai:center jc:center`).
  - **IconBadge** (clipboard-list): `<IconBadge icon={ClipboardList} size="lg" shape="circle" tone="primary" aria-hidden />`.
  - **Eyebrow**: `<p className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-accent">REQUIRED QUESTIONNAIRE</p>`.
  - **Heading**: `<h1 className="text-[26px] font-bold text-foreground text-center leading-[1.2] w-full">Before you go any further</h1>`.
  - **Subhead**: `<p className="text-[15px] text-muted-foreground text-center max-w-[300px] leading-[1.5]">A captain needs this from you. You can't use Camp 404 until it's done.</p>`.
  - **QCard**: `<QCard title="Safety & logistics" questionCount={8} estimatedMinutes={3} className="w-full" />`.
  - **Start CTA**: `<Button asChild className="w-full py-[14px]"><Link href={wizardHref}>Start questionnaire</Link></Button>` where `wizardHref` is the wizard route (post-D17 resolution).
  - **Lock notice row**: `<div className="flex items-center gap-[6px]"><Lock className="size-3 text-muted-foreground" aria-hidden="true" /><span className="text-[12px] font-medium text-muted-foreground">This can't be skipped.</span></div>`.
  - **Sign out link**: `<a href="/auth/sign-out" className="text-[13px] font-semibold text-muted-foreground">Sign out</a>`.

- In `page.tsx`: add the routing branch. If query param approach: when `searchParams.start !== "1"` (and after gate checks pass), render `<QuestionnairePage />` (gate.tsx export) instead of the wizard. If sub-route approach: `page.tsx` becomes gate-only and the wizard moves to `wizard/page.tsx`.

**Acceptance criteria:**
- Navigating to `/onboarding/questionnaire` (as an authenticated, invited, incomplete
  user) renders the S25 full-screen interstitial — not the wizard.
- Tapping "Start questionnaire" navigates to the wizard (at the resolved route).
- No wizard chrome (ProgressBar, Back/Next footer) is visible on the gate screen.
- No rank check, no `CaptainLock`, no data from `getIdDocuments`.
- "Sign out" link is unconditionally visible (not conditional on a page-index flag as in the wizard's `firstStepSignOut` prop).
- The page is server-rendered (no hydration mismatch; `gate.tsx` has no `"use client"`).
- `export const dynamic = "force-dynamic"` is present on `page.tsx` (session reads).

**CI requirement:** each change ships as an independently green-CI commit per MEMORY:
`green-ci-is-done`. The gate build (Step 1) ships alone once Steps 0.1–0.4 prerequisites are green.

### Step 2 — Gate redirect guards (carried from existing logic, confirmed correct)

The existing `page.tsx` gate checks (`:19–28`) already cover unauthenticated, invite-gated,
and already-complete redirects. When the gate UI is added in Step 1, these checks remain
unchanged in `page.tsx` — they run before the gate branch and redirect before the
interstitial is ever returned.

**Acceptance:** an authenticated + already-complete user navigating to
`/onboarding/questionnaire` is redirected to `/` (not shown the interstitial). An
unauthenticated user is redirected to `/auth/sign-in`. An uninvited user is redirected
to `/signup/required`.

**E2E_TEST_MODE seam:** the `hasCampAccess` check in `page.tsx` already delegates to the
test-mode backend (`isE2ETestMode()` in `lib/users.ts`). The gate surface adds no new
test-mode logic; it inherits the existing seam. The E2E test (`onboarding-questionnaire.spec.ts`,
which today uses `E2E_TEST_MODE=1` + `INVITE_CODES=TEST-INVITE`) must be extended to
verify the gate screen renders before the wizard advances.

### Step 3 — Add/extend tests

**Unit (optional, not blocking):** `apps/web/app/onboarding/questionnaire/page.test.ts`

- Test the gate-branch path: when `profile.completedAt` is null (gate should render),
  when `profile.completedAt` is set (should redirect to `/`), when `hasCampAccess`
  returns false (should redirect to `/signup/required`). Mirror the pattern in
  `apps/web/app/onboarding/questionnaire/actions.test.ts` for module mocking.
- *Acceptance:* `pnpm test --filter apps/web` passes; no regressions on the existing
  `actions.test.ts` suite.

**E2E (extend existing):** `apps/web/tests/e2e/onboarding-questionnaire.spec.ts`

- Add a step asserting the gate screen is shown before the wizard:
  - Assert `"Before you go any further"` heading is visible before "Start questionnaire" is tapped.
  - Assert `"Safety & logistics"` QCard is rendered.
  - Assert "Sign out" link is visible.
  - Tap "Start questionnaire" → assert the wizard mounts (ProgressBar or step-1 content visible).
- *Acceptance:* E2E green with `E2E_TEST_MODE=1`; existing wizard completion flow unaffected.

---

## Open items — surface-specific decisions

Cross-references to `design/spec/open-questions.md`:

| # | Item | Severity | Cross-ref |
|---|---|---|---|
| 1 | **Route split: gate at root vs sub-route vs query param (D17).** Gate and wizard both target `/onboarding/questionnaire`. The build shape of `page.tsx` and the wizard host depends entirely on this decision. Recommend: gate at root (bare `page.tsx`), wizard at `./wizard` sub-route or `?start=1` query param. The query-param approach is simpler (one file, one export); the sub-route is cleaner for server-side gating granularity. Must be locked before Step 1. **Owner: eng.** | med — blocks Step 1 build | `open-questions.md D17`, `23-questionnaire-gate.md OQ1` |
| 2 | **Static vs dynamic QCard copy (A8).** "Safety & logistics", "8 questions", "about 3 minutes" are static strings matching S25. If questionnaire-trio scope (A2) ships, the QCard copy must be derived from the blocking `required_action`'s `title`, question catalogue, and a per-questionnaire time estimate. For the initial single burner-profile gate, static strings are specified. Do **not** silently reconcile to "12 pages" (the live catalogue count). **Owner: product** (content decision). | low — initial build uses static; parameterisation is a follow-on | `open-questions.md A2, A8`, `23-questionnaire-gate.md OQ2, OQ5` |
| 3 | **Questionnaire trio scope (A2).** S25→S26→S27 together suggest a multi-questionnaire sequential queue (Safety / Dietary / Agreements). If multiple blocking questionnaires are required, the gate must accept a `required_action` record to know which questionnaire to show and what QCard copy to display. The existing `required_actions` engine supports this without schema changes; it is a product scope call, not a structural one. **Owner: product.** | high — gates surface 27 and multi-queue behaviour | `open-questions.md A2, A3, A4`, `23-questionnaire-gate.md OQ2` |
| 4 | **QCard extraction as a shared component (B15).** `molecule-qcard.md` already plans QCard as a shared `@camp404/ui` component with two consumers (this gate + the S22 global overlay). This is pre-decided in the component plan; the only question is build-time extraction vs inline-then-extract. Plan assumes shared extraction (per `molecule-qcard.md`). | low — resolved in the component plan | `open-questions.md B15`, `23-questionnaire-gate.md OQ4` |
| 5 | **"Hardware competency" page count (A1).** The burner-profile catalogue has 12 pages (including `competency.hardware`) but OB boards show 11 steps. S25's QCard shows "8 questions" — a count inconsistent with both 11 and 12. The count and the QCard copy are a content decision, not a structural one; they are static strings on this surface and must not be inferred from `flattenQuestions(QUESTIONNAIRE).length` without the content reconciliation locked. **Owner: product.** | high (for wizard/QCard copy) — does not block gate layout; blocks QCard count accuracy | `open-questions.md A1`, `23-questionnaire-gate.md OQ3` |
| 6 | **`completedAt` overwrite data-integrity (D16).** `upsertBurnerProfile` unconditionally sets `completed_at = now()` on replay, silently clobbering the original completion timestamp. The gate reads `profile?.completedAt` for its redirect guard — if this is falsely reset, a completed user may see the gate instead of being redirected home. The service-layer plan (03-questionnaire-forms.md Step 3) plans the COALESCE fix; that fix must land before or alongside the gate build to avoid false gate renders on replayed completions. **Owner: eng.** | high — data-integrity pre-requisite | `open-questions.md D16`, `03-questionnaire-forms.md Step 3` |
