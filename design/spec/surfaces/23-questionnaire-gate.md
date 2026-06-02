# Questionnaire gate (interstitial) — functional brief

- **Route(s):** `/onboarding/questionnaire` (intro step, before the wizard begins)
- **Canonical board(s):** `S25 Questionnaire gate` (board #34, 430×932px, `design/.spec-extract/boards/34-s25-questionnaire-gate.txt`)
- **Superseded / dropped:** The `S22 Global overlays` board contains a near-identical `QuestionnaireBlock` overlay variant (same layout, slightly smaller scale — 480px vs 932px tall, tighter padding, sign-out collapsed into a single line "Can't be skipped · Sign out"). That overlay variant is superseded for this route; S25 is the **routed full-screen interstitial** and is canonical here. The S22 overlay variant remains in scope for the global-overlay spec only.
- **Breakpoints:** Mobile-first 430px (canonical board size). No desktop variant is drawn; use `max-w-md mx-auto` centering on wider viewports.

---

## Purpose

A full-screen interstitial page shown to any authenticated, invited user who has an outstanding `burner_profile` blocking `required_action` and has not yet started the questionnaire wizard (or has been routed here by the gating spine before the wizard loads).

The gate does two things: (1) communicates the mandatory nature of the questionnaire without ambiguity — the app is locked until it is done — and (2) summarises what the user is about to do (questionnaire name, question count, estimated time) so there is no surprise when the wizard opens. It is a confidence-building interstitial, not a functional step of the wizard itself.

**Distinct interstitial vs wizard page 0:** The board renders this as a separate full-screen surface (own route, no wizard chrome, no ProgressBar). It is NOT folded into wizard page 0. The wizard starts at `pageIndex = 0` once the user taps "Start questionnaire" and navigates forward. This keeps the wizard chrome (ProgressBar, Back/Next controls) out of the gate screen and lets the gate show the "Sign out" escape without the wizard's footer control logic.

This surface is the routed questionnaire gate (owned by `/onboarding/questionnaire`). It is NOT the overlay variant that S22 shows on top of arbitrary screens.

---

## Layout & modules

Single non-scrolling full-viewport column (`min-h-[100dvh]`). One absolute decoration layer; one centred content column.

### Decoration layer (absolute, aria-hidden, pointer-events-none)

| Layer | Token / value | Effect |
|---|---|---|
| Scan overlay | `fill: #00dcff08` (8% cyan tint) | Full-bleed scan-line atmosphere, matches app-wide glitch aesthetic |

### Content column

`display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 28px; height: 100%;`

Elements top-to-bottom:

1. **Icon badge** — 60×60px circle, `fill: #ff008c2e` (translucent magenta), `border-radius: 999px`. Lucide `clipboard-list` icon, 28px, `fill: $primary`.
2. **Eyebrow label** — `"REQUIRED QUESTIONNAIRE"` — JetBrains Mono, 11px, 700 weight, `$accent`, letter-spacing 2px.
3. **Heading** — `"Before you go any further"` — Inter, 26px, 700 weight, `$foreground`, centered, `line-height: 1.2`, full-container width.
4. **Subhead** — `"A captain needs this from you. You can't use Camp 404 until it's done."` — Inter, 15px, normal weight, `$muted-foreground`, centered, max-width 300px, `line-height: 1.5`.
5. **QCard** — card component, `fill: $card`, `stroke: $border`, `border-radius: $radius`, padding 16px, gap 10px, full-container width. Contains:
   - Title: `"Safety & logistics"` — Inter, 16px, 700, `$foreground`.
   - Meta row (horizontal, gap 14px, align-items center):
     - Count chip: Lucide `list-checks` (14px, `$muted-foreground`) + `"8 questions"` (Inter 12px/500/`$muted-foreground`).
     - Time chip: Lucide `timer` (14px, `$muted-foreground`) + `"about 3 minutes"` (Inter 12px/500/`$muted-foreground`).
6. **Start CTA** — full-width button, `fill: $primary`, `border-radius: $radius`, padding `[14px, 0]`. Label: `"Start questionnaire"` — Inter, 15px, 700, `$primary-foreground`. Maps to `Button-Primary`.
7. **Lock notice** — horizontal row, gap 6px, align-items center. Lucide `lock` (12px, `$muted-foreground`) + `"This can't be skipped."` (Inter 12px/500/`$muted-foreground`).
8. **Sign out link** — `"Sign out"` — Inter, 13px, 600, `$muted-foreground`. Plain `<a href="/auth/sign-out">` — escape hatch only, no confirmation.

---

## Components used (reusable + new)

| Component | Role | Key props / variants |
|---|---|---|
| `Button-Primary` (canvas reusable) | "Start questionnaire" CTA — full-width | full-width, label override `"Start questionnaire"` |
| **`QCard`** (new, local) | Questionnaire summary card: name + question count + estimated time | `title` (string), `questionCount` (number), `estimatedMinutes` (number) — renders the meta chips internally |

No other canvas reusables (TopChrome, SectionHeader, DetailHeader, GridTile, Button-Outline, InputField, Card, EmptyState, CaptainLock) appear on this board. The `Card` reusable is NOT used — `QCard` is drawn directly in S25 with its own local layout rather than as an instance of the canvas `Card` component.

---

## States — every state/variant

| State | Description |
|---|---|
| **Default / ready** | Page loads with all content visible, CTA active. This is the only interactive state. |
| **Loading (server)** | Server component gate-checks run before first paint (`getAuthenticatedUserOrRedirect`, `ensureCampUser`, `hasCampAccess`, completion check). No client spinner — RSC streams; show skeleton if needed. |
| **Invite-gated** | `hasCampAccess` false → server redirects to `/signup/required` before this page renders. User never sees the gate. |
| **Already-complete** | `profile.completedAt` is set → server redirects to `/` before this page renders. User never sees the gate. |
| **Pending-approval / rejected** | Approval status is checked by the gating spine (`app/page.tsx`), not by this surface. If routed here despite pending/rejected status, the invite gate above fires first. This surface does not inspect `approvalStatusEnum`. |
| **Captain-only-locked** | N/A — no rank-gated content; questionnaire is per-member, not rank-scoped. `CaptainLock` is not used here. |
| **No-data (offline / action error)** | This is a static presentation screen with no data fetches visible to the client. No error state beyond the server-side redirect guards. |

No empty, populated, validation-error, submitting, or success states apply — the gate carries no form input and performs no write operations itself.

---

## User actions — each action → result

| Action | Result |
|---|---|
| Tap **"Start questionnaire"** | Navigate to the wizard at `/onboarding/questionnaire` with `pageIndex = 0`. In the current implementation the gate and wizard share the same route; the "start" action either mounts the wizard (replacing this interstitial in the same page) or navigates to a sub-route. See Open Questions. |
| Tap **"Sign out"** | Navigate to `/auth/sign-out`. No confirmation dialog. The sign-out link is visible unconditionally (not page-0-only as in the wizard; on this interstitial it is always present). |

No other actions. The CTA is never disabled on this screen (no async write, no pending transition).

---

## Data & enums — fields/enums touched, mapped to schema.ts

All reads happen server-side before first paint. No writes on this surface.

| Data | Source | Purpose |
|---|---|---|
| Auth session | Neon Auth (`getAuthenticatedUserOrRedirect`) | Gate: redirect to sign-in if unauthenticated |
| `users.id`, `users.invite_code` | `ensureCampUser`, `hasCampAccess` | Gate: redirect to `/signup/required` if no camp access |
| `burner_profiles.completed_at` | `getBurnerProfile(campUser.id)` | Gate: redirect to `/` if profile already complete |
| `required_actions` rows | Gating spine — checked before routing here | Consumed upstream; this surface does not re-query |

Displayed copy (`"Safety & logistics"`, `"8 questions"`, `"about 3 minutes"`) is static strings on this board. They are hard-coded presentation values representing the burner-profile questionnaire, NOT dynamically derived from the catalogue at runtime on this screen.

**NEW schema:** none. This surface touches no new tables or columns.

**Enums read:** none at the surface level. `approvalStatusEnum`, `requiredActionStatusEnum`, `requiredActionTypeEnum` are evaluated upstream in the gating spine before routing here.

---

## Validation & edge cases

- **Re-entry after completion:** `page.tsx` (server) redirects to `/` if `profile.completedAt` is set. Users who finish and navigate back to this route are bounced home.
- **No invite:** `hasCampAccess` false → redirect to `/signup/required`. Never reaches this screen.
- **Unauthenticated:** redirect to `/auth/sign-in`. Never reaches this screen.
- **Wrong-account escape:** the "Sign out" link at the bottom is the intended path; no further guard needed.
- **QCard copy accuracy:** "8 questions" and "about 3 minutes" are drawn static in S25. The live burner-profile catalogue has 12 pages (11 question pages + 1 intro page); the count visible in the card refers to an earlier or simplified framing of the questionnaire (possibly scoped to a Safety sub-questionnaire in the trio context — see Divergences). Until the questionnaire-trio scope is confirmed, these values should remain static strings matching what the board shows.

---

## Flows

```
[Gating spine detects pending burner_profile action]
        |
        v
GET /onboarding/questionnaire
  → server: auth check (→ /auth/sign-in if fail)
  → server: invite check (→ /signup/required if fail)
  → server: completion check (→ / if done)
        |
        v
[S25 gate screen renders]
        |
   "Start questionnaire" tapped
        |
        v
[Wizard mounts at pageIndex 0 — OB Step 01 Profile photo]
   ... (12 wizard pages, progress saves on each Next) ...
        |
   Final submit: markComplete → satisfyBurnerProfileAction
        |
        v
   redirect("/") → gating spine re-evaluates → app unlocked
        
   OR at any point:
   "Sign out" tapped → /auth/sign-out
```

---

## Divergences from feature-set reference — and resolution per the locked decisions

| Divergence | Board (S25) signal | Feature-set (04-onboarding-wizard.md) signal | Resolution |
|---|---|---|---|
| **This screen does not exist in the feature-set reference** | S25 draws a distinct full-screen interstitial with its own visual composition | Feature-set 04 describes the wizard directly, with the server page rendering H1 "Build your burner profile" before mounting `QuestionnaireWizard`. No mention of a pre-wizard gate screen. | **Board wins.** S25 is a new distinct surface — a pre-wizard interstitial — not a wizard intro page. Implement as a server component that renders S25 UI, then on CTA tap mounts/navigates to the wizard. |
| **Questionnaire title: "Safety & logistics" vs burner-profile** | S25 QCard shows `"Safety & logistics"` with `"8 questions"` and `"about 3 minutes"` | The live burner-profile questionnaire has 12 pages and 30+ questions across multiple topics | **Scope question flagged (see Open Questions).** The board may anticipate the questionnaire-trio design (S27 queue shows Safety / Dietary / Agreements as separate questionnaires). The gate copy should reflect whichever questionnaire the user is being blocked on. For the burner-profile gate specifically, the static copy is a content decision, not a structural one. Do not silently reconcile to "12 pages" — flag. |
| **"8 questions" count** | Board hard-codes `"8 questions"` | Burner-profile catalogue has 30+ individual questions across 12 pages | Per above — static string on this screen; content is a design/copy decision pending trio scope confirmation. |
| **Sign-out link position** | S25 shows "Sign out" as a standalone text link below the lock notice — always visible | Wizard (`wizard.tsx`) shows "Sign out" only on page 0 and only when `firstStepSignOut=true`; it lives in the footer nav | No conflict — this is the interstitial, not the wizard. Sign-out is unconditionally visible here. Preserve as drawn. |
| **S22 overlay variant** | S22 contains a near-identical `QuestionnaireBlock` overlay for the global-overlay system | Not mentioned in 04-onboarding-wizard.md | The overlay variant is for the global-overlays surface (unit TBD). S25 owns the routed full-screen version. The two share visual composition but are distinct implementations (overlay vs routed page). |

---

## Open questions / build reconciliations

1. **Distinct route vs same-route reveal:** The gate and the wizard both live at `/onboarding/questionnaire`. Should the gate render on a sub-route (`/onboarding/questionnaire/intro`) and the wizard at the root, or should the route use a `step` query param / React state to toggle between gate and wizard? A distinct sub-route is cleaner for server-side gating logic but requires an extra route. Recommend: gate at `/onboarding/questionnaire` (the root), wizard at `/onboarding/questionnaire/wizard` or driven by a query param `?step=0`. Confirm before build.

2. **Questionnaire trio scope:** S25 + S26 + S27 together suggest a multi-questionnaire sequential queue (Safety / Dietary / Agreements as separate required questionnaires), not a single burner-profile monolith. The `"Safety & logistics"` title and `"8 questions"` count are inconsistent with the current burner-profile catalogue. The locked decisions note (`decisions.md`, last bullet under carried build-reconciliations) flags this: "the multi-questionnaire sequential queue (Safety/Dietary/Agreements) is expressible via the existing `required_actions` engine (no schema change); sequential unlock = app logic. Spec as drawn; flag as scope expansion to confirm." **Confirm with user before assigning question count / time estimate copy.**

3. **Hardware competency page missing from OB boards:** The onboarding board sequence (OB Step 01–11) covers 11 steps but the burner-profile catalogue has 12 pages (hardware_competency is page 8, between cooking_competency and leadership_logistics). The decisions doc flags this as an open content question. This gate screen is unaffected by the count, but the wizard spec (unit TBD) must resolve it before "Step N of 12" is finalised.

4. **QCard as a reusable component:** The QCard drawn in S25 is structurally identical to the QCard in the S22 overlay. If trio-style questionnaire gates become common (one gate per required questionnaire), QCard should be extracted as a shared component accepting `title`, `questionCount`, and `estimatedMinutes` props. Mark as a build-time extraction decision.

5. **Dynamic vs static QCard copy:** If the gate is eventually parameterised by `required_action` (i.e. shows whichever questionnaire is currently blocking), the QCard copy (`"Safety & logistics"`, `"8 questions"`, `"about 3 minutes"`) must be derived from the activation's `title`, question catalogue, and a static time estimate per questionnaire. For the initial build with only the burner-profile gate, static strings are acceptable.
