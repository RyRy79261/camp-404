# Unit 16 — Registration / onboarding state machine, invites, entitlements, join flow

HARVEST doc. Donor = quagga-portal (AfrikaBurn Contributors App) at
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`.
Every claim below is cited `path:line` against that tree. Read-only harvest; no gap analysis.

---

## 0. Purpose of this subsystem in the donor

Four intertwined engines, all owned by `@quagga/core` (pure, zero-I/O) and bound to Postgres by
`apps/web/lib/*-store.ts`:

1. **The hard-gate spine** — `required_actions` rows decide "what blocks this user next"; the first
   pending blocking row maps to a fill route and every gated participant surface redirects there.
   This is the *direct analogue of Camp 404's `nextGate` / `ACTION_ROUTES`*, and it is materially
   more developed: it is **per-edition**, it is **released when an activation closes**, and it
   **excludes org-internal activations** from the participant app.
   (`packages/core/src/questionnaire-engine.ts:18-52`, `apps/web/lib/required-actions.ts:16-167`,
   `apps/web/lib/session.ts:210-264`.)
2. **The registration state machine** — a 7-state workflow over `registrations` with legal-transition
   tables, a camp-action resolver, a per-section review/reply conversation, TOCTOU compare-and-set
   guards on both the camp side and the org side, and a "reason belongs to the state it was said
   about" invariant. (`packages/core/src/registration-state.ts`, `apps/web/lib/registration-store.ts`,
   `apps/org/lib/actions/registrations.ts`.)
3. **Entitlements + the submit gate** — `isRegistered` (approved row ⇒ registered) plus a
   *two-form* submit gate that deliberately gates on a **subset** of sections.
   (`packages/core/src/entitlements.ts`, `packages/types/src/registration.ts:79-103`.)
4. **The invite / join round trip** — one-time bearer tokens, a four-state landing page resolver,
   an httpOnly pending-invite cookie that carries the token across sign-up **and across the hard
   gate**, a confirm-before-write resume page, and an atomic `used_at IS NULL` claim inside a
   transaction with the membership write. (`packages/core/src/invite.ts`,
   `packages/core/src/invite-view.ts`, `apps/web/lib/{pending-invite,invite-flow,invites-store}.ts`,
   `apps/web/app/join/**`.)

Adjacent, and harvested because it sits inside the same spine: **camp-scoped member reference codes**
(`MAH-M017`), **camp-name dedupe** (exact normalized reject + pg_trgm-equivalent similarity warn),
and the **account-level username** rules (the public handle + display fallback).

---

## 1. File inventory (line counts verbatim from `wc -l`)

### `packages/core/src` — pure logic (the security + contract boundary)

| File | Lines | What |
|---|---:|---|
| `registration-sections.ts` | 127 | Per-section completeness predicates + `completedSectionsFor` |
| `registration-state.ts` | 146 | Registration + section-review transition tables, camp actions, reply authz |
| `entitlements.ts` | 88 | `isRegistered`, `isSubmittable`, `missingSections`, `missingForm2Sections`, `isFullyComplete` |
| `invite.ts` | 77 | `canRedeemInvite`, `canRedeemInviteAs`, rejection copy |
| `invite-view.ts` | 190 | `resolveInviteView` + the whole auth round-trip constant set |
| `member-ref-code.ts` | 123 | `MAH-M017` derivation, disambiguation, parse, next sequence |
| `name-dedupe.ts` | 70 | `normalizeName`, `trigramSimilarity`, `SIMILARITY_WARN_THRESHOLD` |
| `username.ts` | 257 | Handle rules, 90-entry reserved list, `publicMemberName` |
| `questionnaire-engine.ts` | 52 | `BURNER_BIO_ACTION_KEY`, `RequiredActionLike`, `firstBlockingAction`, `isParticipantFacingActivation` |
| `questionnaire-activation.ts` | 142 | `questionnaire:<id>` key convention, required-action row builders, completion tally |
| `form-2.ts` | 177 | Form-2 questionnaire → `registrations` column mirror with `unmapped`/`unfilled` reporting |
| `word-count.ts` | 37 | `CAMP_DESCRIPTION_WORD_LIMIT = 60`, `countWords`, `wordsRemaining` |
| `sound.ts` | 69 | `SOUND_SCALE` (5 levels), `isNoAmplifiedSound` |
| `placement-zones.ts` | 69 | Per-edition-year placement zone catalogue |
| `god-emails.ts` | 41 | `parseGodEmails`, `isGodEmailIn`, `canBootstrapGod` (verified-email gate) |

### `packages/types/src`

| File | Lines | What |
|---|---:|---|
| `registration.ts` | 127 | `RegistrationStatus`, `SectionKey`, `SECTION_KEYS`, `FORM_1_SECTION_KEYS`, `FORM_2_SECTION_KEYS`, `formForSection`, `SECTION_LABELS`, `SectionReviewStatus`, `OperatingHours`, `MAX_LAYOUT_UPLOADS` |

### `apps/web/lib` — server-only binding layer

| File | Lines | What |
|---|---:|---|
| `required-actions.ts` | 167 | `actionRoute`, `ensureRequiredAction`, `completeRequiredAction`, `listRequiredActions` (the gate query) |
| `session.ts` | 264 | `ensureCampUser`, `bootstrapGod`, `pendingBlockingRoute`, `enforceGate`, `viewerIsGated`, `requireOnboardedUser` |
| `registration-store.ts` | 658 | Wizard persistence, `applyCampAction`, section reviews + replies, supplier picker |
| `project-registration-store.ts` | 460 | MV / artwork registration on the same spine, `proj:<groupId>:<slug>` answer key |
| `invites-store.ts` | 325 | `createInvite`, `revokeInvite`, `listInvites`, `getInvitePreview`, `redeemInvite` |
| `invite-flow.ts` | 46 | `completeInviteJoin` — the single join completion point |
| `pending-invite.ts` | 56 | httpOnly cookie read/write/conditional-clear |
| `groups-store.ts` | 1024 | (partially in-unit) `checkCampName`, `createCamp`, `nextMemberRefCode`, `ensureMembershipWithRefCode` |
| `bio-store.ts` | 530 | (partially in-unit) `saveBio` → `completeRequiredAction` on `final` |
| `edition.ts` | 78 | `getActiveEdition` (request-cached), `getEditionLabel`, `FALLBACK_EDITION_LABEL` |

### `apps/web/app` — routes

| File | Lines | What |
|---|---:|---|
| `join/[token]/page.tsx` | 234 | Signed-out-first invite landing, 3 card states |
| `join/[token]/actions.ts` | 90 | `acceptInviteAction` — one entry point, every viewer state |
| `join/continue/page.tsx` | 126 | The confirm-before-write resume page |
| `join/continue/actions.ts` | 56 | `confirmInviteJoinAction` |
| `(app)/onboarding/page.tsx` | 80 | Burner Bio gate page (pre-fill + invite-aware `redirectTo`) |
| `(app)/onboarding/actions.ts` | 84 | `saveOnboardingBioAction`, `checkUsernameAvailabilityAction` |
| `(app)/camps/[slug]/registration/page.tsx` | 227 | Editable-vs-locked fork |
| `(app)/camps/[slug]/registration/actions.ts` | 418 | Zod boundary + 5 server actions |
| `(app)/camps/new/actions.ts` | 68 | `createCampAction` (dedupe reject/warn/confirm) |
| `(app)/camps/[slug]/actions.ts` | 353 | (partially in-unit) `createInviteAction`, `revokeInviteAction` |
| `(app)/layout.tsx` | 48 | `viewerIsGated()` → stripped chrome for a gated viewer |
| `page.tsx` | 152 | Marketing page; signed-in → `redirect(gate ?? "/directory")` |

### `apps/web/components`

| File | Lines | What |
|---|---:|---|
| `registration/registration-wizard.tsx` | 939 | The 6-section wizard + the autosave engine |
| `registration/registration-summary.tsx` | 467 | Locked read-only view + status banners for all 7 states |
| `registration/field-kit.tsx` | 605 | 10 controlled primitives with `onCommit`-on-blur |
| `registration/supplier-picker.tsx` | 149 | Section 6 searchable multi-select |
| `registration/section-reply-thread.tsx` | 143 | Two-way per-section reply thread |
| `registration/withdraw-registration.tsx` | 128 | `withdrawConsequence()` + the disabled-with-reason button |
| `registration/reopen-registration-button.tsx` | 66 | The `withdrawn → draft` control |
| `registration/layout-uploads.tsx` | 49 | Thin wrapper over `@quagga/ui` `FileUpload`, max 4 |
| `onboarding/bio-flow.tsx` | 803 | The Burner-Bio runner (adjacent — belongs to the bio unit) |
| `member-ref-code.tsx` | 74 | Copy-to-clipboard ref-code chip / banner |
| `camp-invites.tsx` | 149 | Lead-side invite list: mint / copy / revoke |
| `join-button.tsx` | 23 | `useFormStatus` submit button for the invite form |

### `apps/org/lib`

| File | Lines | What |
|---|---:|---|
| `actions/registrations.ts` | 304 | `decideRegistration`, `addSectionReview`, `setSectionReviewStatus` |
| `project-registration.ts` | 75 | Duplicate read of the `proj:<groupId>:<slug>` answers |
| `project-review.ts` | 396 | Kind-specific MV/artwork review section model |
| `org-logic.ts` (excerpt) | — | `REVIEW_ACTIONS`, `REVIEW_ACTION_TARGET`, `resolveReviewActionPath`, `resolveReviewAction` |

### `packages/ui/src`

| File | Lines | What |
|---|---:|---|
| `components/wizard.tsx` | 165 | The ONLY numbered-sections component (rail + strip variants) |
| `lib/wizard.ts` | 84 | `deriveWizardProgress` — pure state derivation, `"3 of 6 complete"` |
| `components/checkbox.tsx` (`AckRow`) | :30-63 | Whole-row ≥44px acknowledgement checkbox |

### Tests

| File | Lines |
|---|---:|
| `packages/core/src/__tests__/registration-sections.test.ts` | 222 |
| `packages/core/src/__tests__/registration-state.test.ts` | 184 |
| `packages/core/src/__tests__/entitlements.test.ts` | 102 |
| `packages/core/src/__tests__/invite.test.ts` | 95 |
| `packages/core/src/__tests__/invite-view.test.ts` | 258 |
| `packages/core/src/__tests__/member-ref-code.test.ts` | 125 |
| `packages/core/src/__tests__/name-dedupe.test.ts` | 48 |
| `packages/core/src/__tests__/username.test.ts` | 224 |
| `packages/core/src/__tests__/questionnaire-engine.test.ts` | 94 |
| `packages/core/src/__tests__/questionnaire-activation.test.ts` | 111 |
| `packages/core/src/__tests__/form-2.test.ts` | 178 |
| `packages/core/src/__tests__/dedupe-integration.test.ts` | 60 |
| `packages/core/src/__tests__/cross-side-identity.test.ts` | 272 |
| `apps/web/lib/__tests__/registration-store.test.ts` | 529 |
| `apps/web/lib/__tests__/invites-store.test.ts` | 390 |
| `apps/web/lib/__tests__/session-guards.test.ts` | 420 |
| `apps/web/lib/__tests__/decision-reason-invariant.test.ts` | 62 |
| `apps/org/lib/__tests__/registration-decision-actions.test.ts` | 367 |
| `apps/org/lib/__tests__/project-review.test.ts` | 228 |
| `e2e/specs/new-burner/onboarding-gate.spec.ts` | 73 |
| `e2e/specs/anon/signed-out-invite-acceptance.spec.ts` | 208 |
| `e2e/specs/camp-lead/invites.spec.ts` | 122 |
| `e2e/specs/camp-lead/registration.spec.ts` | 123 |
| `e2e/specs/camp-lead/review-loop.spec.ts` | 151 |
| `e2e/specs/camp-lead/decision-outcomes.spec.ts` | 155 |
| `e2e/specs/camp-lead/camp-lifecycle.spec.ts` | 97 |
| `e2e/specs/new-burner/directory-and-join.spec.ts` | 82 |

---

## 2. Capability list (exhaustive, each cited)

### 2.1 The hard-gate / required-action engine

- **Action key → route registry lives in the app, not in core** — `ACTION_ROUTES` maps only keys with
  a built page; everything else returns `null`. `apps/web/lib/required-actions.ts:16-18`.
- **Dynamic questionnaire routing** — any `questionnaire:<id>` key routes to `/questionnaires/<id>`
  without a registry entry, which is what lets both org-outbound and project-authored activations
  gate. `apps/web/lib/required-actions.ts:26-30`, key convention at
  `packages/core/src/questionnaire-activation.ts:31-42`.
- **Idempotent action creation, per edition** — `ensureRequiredAction` uses
  `onConflictDoNothing({ target: [userId, editionId, actionKey] })`.
  `apps/web/lib/required-actions.ts:43-69`.
- **Per-edition scoping of both write and read** (migration 0024) — the bio persists but must be
  *confirmed once per burn*. `apps/web/lib/required-actions.ts:32-42`, `:112-121`.
- **Closing an activation releases its gate** — `listRequiredActions` LEFT JOINs
  `questionnaire_activations` and computes `blocking && (activationStatus === null || activationStatus === "open")`.
  `apps/web/lib/required-actions.ts:128-165`. This is the "close is the only undo for a mis-sent
  blocking send" property.
- **Org-internal activations never gate the participant app** — filtered by
  `isParticipantFacingActivation(r.audience)`. `apps/web/lib/required-actions.ts:156`,
  predicate at `packages/core/src/questionnaire-engine.ts:48-52`.
- **Request-scoped caching** — `listRequiredActions` is wrapped in React `cache()` because the gate is
  consulted on essentially every gated surface. `apps/web/lib/required-actions.ts:109`.
- **Priority = creation order** — `firstBlockingAction` returns the first `blocking && status === "pending"`
  in input order, and `listRequiredActions` orders by `asc(createdAt)`.
  `packages/core/src/questionnaire-engine.ts:30-37`, `apps/web/lib/required-actions.ts:154`.
- **Never strand the user** — an unroutable key falls back to `/onboarding` rather than returning null.
  `apps/web/lib/session.ts:216`.
- **Four gate entry points, one spine** — `pendingBlockingRoute` (raw), `enforceGate(userId, currentPath?)`
  (redirect unless already on the route, so the fill page doesn't loop), `viewerIsGated()` (chrome-only,
  explicitly *not* authorisation), `requireOnboardedUser()` (auth + gate).
  `apps/web/lib/session.ts:210-264`.
- **The layout strips chrome for a gated viewer** — `(app)/layout.tsx:46-47` calls `viewerIsGated()` and
  passes `gatedNav` to `AppShell`; the comment at `:41-45` records that hoisting the shell into a layout
  previously leaked the full nav above the gate page's own minimal header.
- **The marketing root routes past itself** — `redirect(gate ?? "/directory")`. `apps/web/app/page.tsx:53-54`.
- **A route handler enforces the gate as a 403** (cannot redirect) —
  `apps/web/app/api/registration/upload/route.ts:30-39`.
- **Completion hook** — `saveBio(..., final: true)` calls
  `completeRequiredAction(userId, editionId, BURNER_BIO_ACTION_KEY)`. `apps/web/lib/bio-store.ts:439-445`.
- **First-authenticated-request provisioning** — `ensureCampUser` upserts the `users` row, runs the
  GOD_EMAILS bootstrap, and raises the blocking bio action for the active edition, all `cache()`d per
  request. `apps/web/lib/session.ts:120-179`.
- **Re-animation guard** — a sanitized account is refused (`isSanitized(campUser)` → `return null`)
  before anything is minted or bootstrapped. `apps/web/lib/session.ts:144-152`.

### 2.2 Registration state machine

- **7 statuses, explicit legal-transition table** — `REGISTRATION_TRANSITIONS`.
  `packages/core/src/registration-state.ts:12-40`.
- **`rejected` is terminal; `withdrawn` is NOT** — `withdrawn: ["draft"]`, with a 12-line comment
  explaining that the old terminal `withdrawn` contradicted the confirm dialog's own promise.
  `packages/core/src/registration-state.ts:26-39`.
- **Assert-or-throw with an enumerated allow-list in the message** —
  `assertRegistrationTransition`. `packages/core/src/registration-state.ts:51-63`.
- **Four camp actions** — `["submit", "resubmit", "withdraw", "reopen"]`; `resolveCampAction` maps them
  to target statuses and asserts. `packages/core/src/registration-state.ts:76-112`.
- **Editable statuses are exactly two** — `EDITABLE_STATUSES = ["draft", "changes_requested"]`.
  `apps/web/lib/registration-store.ts:28-35`.
- **Org-side action resolver with a two-hop path** — `resolveReviewActionPath` walks
  `submitted → under_review → approved` when the direct transition is illegal, asserting each hop.
  `apps/org/lib/org-logic.ts` (`resolveReviewActionPath` / `resolveReviewAction`).
- **TOCTOU compare-and-set on both sides** — the camp-side `applyCampAction` guards the UPDATE's WHERE
  on `eq(status, existing.status)` and reports zero rows as a failure
  (`apps/web/lib/registration-store.ts:615-655`); the org-side `decideRegistration` does the same and
  *throws inside the transaction* so no stale audit row is stamped
  (`apps/org/lib/actions/registrations.ts:155-191`).
- **`decision_reason` invariant** — the reason belongs to the state it was said about. The camp's own
  transitions set `decisionReason: null` (`apps/web/lib/registration-store.ts:630-639`); the org's
  decide path writes `reason ? reason : null` on every transition
  (`apps/org/lib/actions/registrations.ts:166-175`). Migration `0027_decision_reason_invariant.sql`
  corrected the rows migration 0025's backfill wrote.
- **Reject and request-changes REQUIRE a reason, with different sentences** —
  `"A rejection needs a reason for the camp."` vs
  `"Tell the camp what to change — a reason is required."`. `apps/org/lib/actions/registrations.ts:127-136`.
- **Decision + audit are one transaction; notification is best-effort AFTER commit** —
  `apps/org/lib/actions/registrations.ts:153-216`, with `console.error` swallow at `:99-101`.
- **Per-section review threads** — `addSectionReview` (org-authored, audited) and
  `setSectionReviewStatus` (validated by `canTransitionSectionReview`).
  `apps/org/lib/actions/registrations.ts:231-304`; transitions at
  `packages/core/src/registration-state.ts:115-129` (`open ↔ resolved`, reopenable, no self-transitions).
- **Two-way reply conversation** — `section_review_replies`, authz by
  `canReplyToSectionReview({ campRole, isOrgStaff })` = any camp member OR org staff.
  `packages/core/src/registration-state.ts:139-146`, write path at
  `apps/web/app/(app)/camps/[slug]/registration/actions.ts:325-396`.
- **The reply action resolves the group from the REVIEW ROW, never from the slug** — "so a caller cannot
  smuggle in an unrelated slug". `apps/web/app/(app)/camps/[slug]/registration/actions.ts:337-348`.
- **Org authors collapse to "AfrikaBurn"** in the camp-visible thread; unknown authors render
  `"A camp member"`. `apps/web/lib/registration-store.ts:190-207`.
- **Withdrawal survives into the locked view** — `WithdrawRegistrationButton` renders on the read-only
  summary because `approved → withdrawn` is legal but the only control lived in the editable wizard.
  `apps/web/components/registration/withdraw-registration.tsx:12-17`.
- **Refused actions stay visible and disabled with the reason spelled out** —
  `refusalReason(status)`. `apps/web/components/registration/withdraw-registration.tsx:64-71`, `:86-88`.

### 2.3 Entitlements + submit gate

- **`isRegistered(registrations)` = `some(r => r.status === "approved")`** — the single entitlement
  predicate. `packages/core/src/entitlements.ts:22-26`.
- **`isApprovedRegistration(row | null | undefined)`** for the single-row case.
  `packages/core/src/entitlements.ts:29-33`.
- **The submit gate is FORM 1 ONLY** — `isSubmittable` checks `FORM_1_SECTION_KEYS.every(...)`, not all
  six, because Form 1 opens in September and Form 2's questions are unanswerable then.
  `packages/core/src/entitlements.ts:35-54`.
- **Three separate "what's outstanding" answers** — `missingSections` (Form 1, drives the camp's own
  to-do list), `missingForm2Sections` (for surfaces that legitimately care), `isFullyComplete` (both
  forms). `packages/core/src/entitlements.ts:56-88`.
- **Per-section completeness is server-recomputed, never client-trusted** —
  `saveRegistrationDraft` writes `completedSectionsFor(toSectionData(...))`.
  `apps/web/lib/registration-store.ts:456`, `:487`.

### 2.4 Invites + join flow

- **Single-use beats expiry** — a stamped invite reports `already_used` regardless of `expiresAt`.
  `packages/core/src/invite.ts:32-46`.
- **Two spent signals** — `usedAt !== null || usedByUserId !== null`. `packages/core/src/invite.ts:36`.
- **`<=` expiry boundary** — the exact expiry instant is expired. `packages/core/src/invite.ts:39-44`.
- **Null expiry never expires.** `packages/core/src/invite.ts:41`.
- **`member` vs `lead_transfer` redeemer rules** — a `member` invite is refused for an existing member
  (`self_member`); a `lead_transfer` is valid for an existing member (that's how a lead hands over).
  `packages/core/src/invite.ts:54-65`.
- **Four landing states, viewer-INDEPENDENT spent/expired decision** — `resolveInviteView` returns
  `{status, cta, showCamp, kind}`; a dead link looks identical signed in or out so redemption state
  cannot be probed. `packages/core/src/invite-view.ts:78-118`.
- **`showCamp` is TRUE only for a live invite** — a dead token buys a stranger no information, which is
  also what keeps a free/invite-only camp undiscoverable through a dead link.
  `packages/core/src/invite-view.ts:54-59`, e2e at `e2e/specs/anon/free-camp-undiscoverable.spec.ts`.
- **Four CTAs** — `authenticate | redeem | open_camp | none`. `packages/core/src/invite-view.ts:43`.
- **Token never enters a URL after the landing page** — httpOnly, SameSite=Lax, 1-hour cookie.
  Rationale (Referer leak, address bar, history, analytics logs, injected script) at
  `packages/core/src/invite-view.ts:122-137`; the write at `apps/web/lib/pending-invite.ts:24-34`.
- **SameSite=Lax is a deliberate choice over Strict** — the return leg is a top-level GET from Google's
  OAuth callback or an emailed verification link, which Strict would drop.
  `packages/core/src/invite-view.ts:130-133`.
- **Token grammar guards BOTH the URL segment and the cookie value** —
  `/^[A-Za-z0-9_-]{16,128}$/`. `packages/core/src/invite-view.ts:151-160`, applied at
  `apps/web/lib/pending-invite.ts:25`, `:42` and `apps/web/app/join/[token]/page.tsx:201`.
- **Conditional cookie clear** — `clearPendingInvite(token?)` only drops a cookie holding that exact
  token, so opening a dead link B does not discard in-flight invite A.
  `apps/web/lib/pending-invite.ts:53-56`.
- **The gate is NEVER bypassed by holding an invite** — all three call sites check
  `pendingBlockingRoute` before completing the join. `apps/web/app/join/[token]/actions.ts:77-83`,
  `apps/web/app/join/continue/actions.ts:45-48`, `apps/web/app/join/continue/page.tsx:57-60`.
- **The gate page returns the user to the invite** — `/onboarding` computes
  `redirectTo = (await readPendingInvite()) ? INVITE_RESUME_PATH : "/directory"`.
  `apps/web/app/(app)/onboarding/page.tsx:48-53`.
- **`/join/continue` is a SERVER ACTION, not a GET handler** — because a Lax cookie IS sent on
  cross-site top-level navigations, so a GET would have been CSRF-triggerable by any third-party link.
  `apps/web/app/join/continue/actions.ts:14-22`.
- **Confirm-before-write fixes WHO redeems** — the cookie binds to a browser, not an account; the page
  names the signed-in email before the button so a shared laptop cannot silently consume someone else's
  one-time link. `apps/web/app/join/continue/actions.ts:24-27`,
  `apps/web/app/join/continue/page.tsx:95-103`.
- **`/join/continue` doubles as the sign-up enumeration fix** — both outcomes (fresh address gets a
  session; existing address does not) land on the same URL.
  `apps/web/app/join/continue/page.tsx:26-31`.
- **Static segment shadows the dynamic one** — `"continue"` is therefore not a possible token, so the
  grammar needs no reserved-word hole. `apps/web/app/join/continue/page.tsx:33-35`.
- **Atomic claim + membership in ONE transaction** — conditional
  `UPDATE ... WHERE id = ? AND used_at IS NULL RETURNING id`; zero rows ⇒ lost race ⇒
  `already_used`, nothing written. `apps/web/lib/invites-store.ts:258-313`.
- **`lead_transfer` demotes ALL sitting leads to `admin`, then promotes the redeemer** — an existing
  member keeps their ref code; a non-member gets a fresh one.
  `apps/web/lib/invites-store.ts:273-302`.
- **A `self_member` redeem is a SUCCESS that sends them in**, not an error.
  `apps/web/lib/invites-store.ts:241-250`.
- **Invite preview leaks only the USERNAME of the inviter** — never a legal name, never an email; a
  sanitized inviter or one with no handle drops the whole "{name} invited you" line.
  `apps/web/lib/invites-store.ts:169-191`, rendered conditionally at
  `apps/web/app/join/[token]/page.tsx:148-161`.
- **The `Registered` badge on the invite card** is resolved from an `approved` registration for the
  passed edition. `apps/web/lib/invites-store.ts:155-167`, `apps/web/app/join/[token]/page.tsx:124-128`.
- **One `<form action>` for every viewer state** — works with JS disabled, always ends in a server-side
  redirect. `apps/web/app/join/[token]/page.tsx:163-168`, `apps/web/components/join-button.tsx:6-15`.
- **`completeInviteJoin` is THE single completion point** shared by the accept action and the resume
  action, so a join minted by either route is identical; it reads the camp name *before* the claim so
  the welcome email can still name it. `apps/web/lib/invite-flow.ts:22-45`.
- **Mint / revoke / list** — default TTL **30 days**, token = `randomBytes(18).toString("base64url")`
  (24 base64url chars); revoke = stamp `usedAt` (so it can never be redeemed) scoped to the group;
  list = unused rows newest-first. `apps/web/lib/invites-store.ts:23-93`.
- **Lead-transfer minting is lead-only** (an `admin` cannot hand over the lead).
  `apps/web/app/(app)/camps/[slug]/actions.ts:85-91`.

### 2.5 Camp creation, name dedupe, ref codes, usernames

- **Exact normalized collision is REJECTED; trigram similarity ≥ 0.55 WARNS and requires an explicit
  `confirmWarnings`** — three-outcome action result `created | error | warn`.
  `apps/web/app/(app)/camps/new/actions.ts:28-58`, `checkCampName` at `apps/web/lib/groups-store.ts`.
- **`normalizeName` = NFKD → strip diacritics → lowercase → strip every non-alphanumeric.**
  `packages/core/src/name-dedupe.ts:14-20`.
- **`trigramSimilarity` reproduces PostgreSQL `pg_trgm`** — two leading spaces + one trailing space per
  word, sliding 3-char window, Jaccard over the sets; two empty strings = 1.
  `packages/core/src/name-dedupe.ts:30-61`.
- **Creator becomes `lead` with a ref code, in the same transaction as the group insert.**
  `apps/web/lib/groups-store.ts` (`createCampWrites`).
- **Ref-code derivation** — first word's first two letters + each later word's first letter, capped at
  4, back-filled from the first word, padded with `X`, empty ⇒ `"XXX"`.
  `packages/core/src/member-ref-code.ts:30-41`.
- **Deterministic collision handling** — base, then 3-letter core + `A`–`Z`, then core + `2`…`999`.
  `packages/core/src/member-ref-code.ts:50-67`.
- **Format `{PREFIX}-M{NNN}`, 1-based, zero-padded to ≥3 digits**; parse regex
  `/^([A-Z0-9]{2,8})-M(\d{3,})$/`. `packages/core/src/member-ref-code.ts:71-98`.
- **Savepoint-retry on the ref-code unique index** — 5 attempts, each inside `tx.transaction` so a raw
  unique violation cannot poison the enclosing transaction.
  `apps/web/lib/groups-store.ts:270-304`.
- **Username rules** — 3–20 chars, `^[a-z0-9_]+$` on the lowercased value, must start with a letter, no
  trailing underscore, no doubled underscore, not reserved; stored as entered, unique on
  `lower(username)`. `packages/core/src/username.ts:185-232`, index at `packages/db/src/schema.ts:311-317`.
- **90 reserved handles** across platform identity, route segments, action words, data-breaking values
  and safety/role words. `packages/core/src/username.ts:49-150`.
- **`publicMemberName`** — username → `"Unnamed burner"`; a sanitized account renders
  `"Departed Burner"`. There is deliberately no third fallback to legal name or email.
  `packages/core/src/username.ts:250-257`, `DEPARTED_BURNER_NAME` at
  `packages/core/src/account-sanitization.ts:24`.
- **Availability check is an authorised, Zod-bounded, enumeration-sane server action** — signed-in only,
  input capped at `USERNAME_MAX_LENGTH * 10` (200), runs the same `validateUsername`, and never hints at
  the holder. `apps/web/app/(app)/onboarding/actions.ts:36-84`.
- **Lost-race handling on the username write** — the unique index violation is reported as the ordinary
  `"That username is already taken. Try another."` rather than a 500, and the pre-check and the race path
  say the *same sentence* so the user cannot tell which fired.
  `apps/web/lib/bio-store.ts:205-208`, `:424-436`.

### 2.6 The wizard UX engine

- **Autosave with a joinable in-flight flush** — concurrent callers JOIN `flushRef.current`; the flush
  loops while `dirtyRef.current` and clears the dirty flag BEFORE the await so an edit landing mid-write
  is caught by the next pass. `apps/web/components/registration/registration-wizard.tsx:164-212`.
- **Debounce 1500 ms on change, immediate flush on blur, 20 000 ms safety-net interval, flush on
  unmount.** `registration-wizard.tsx:224`, `:228`, `:232-239`.
- **Submit flushes first and refuses on a failed flush** — otherwise the server would validate a stale
  draft, producing "6 of 6 complete" in the header and "Complete all six sections" from the server in the
  same click. `registration-wizard.tsx:241-256`, rationale at `:167-176`.
- **Honest save indicator** — `dirty` is load-bearing; the branch used to be
  `state === "saved" || lastSavedAt`, which read a permanent green "Saved just now" while the camp typed.
  `registration-wizard.tsx:892-900`.
- **Sections are enterable in ANY order** — nothing is `blocked` in the wizard model.
  `registration-wizard.tsx:288-292`.
- **Per-section state chip** — `NEEDS CHANGES` (an open review) > `COMPLETE` > `CURRENT`.
  `registration-wizard.tsx:296-302`.
- **`Wizard` UI primitive** — server-component-safe (no hooks), interactivity opt-in via `onSelect`,
  two variants (`rail` desktop / `strip` mobile), one shared pure derivation.
  `packages/ui/src/components/wizard.tsx:10-18`, `packages/ui/src/lib/wizard.ts:42-84`.
- **State precedence in the derivation** — `done` always wins; otherwise the resolved current is
  `current`, `blocked` is `blocked`, else `todo`; an omitted/`done`/`blocked` `currentId` resolves to the
  first actionable step. `packages/ui/src/lib/wizard.ts:42-75`.
- **Live 60-word counter** — `"N words left of 60"` / `"N words over the 60-word limit"`, `aria-live="polite"`.
  `apps/web/components/registration/field-kit.tsx:266-325`.
- **`NumberField` refuses decimals/negatives inline** and only lets a valid entry reach the draft, so an
  invalid one never enters an autosave payload. `field-kit.tsx:157-229`.
- **`Labeled` has two honest modes** — `htmlFor` for labelable controls, `labelId` +
  `aria-labelledby` for button groups and Radix triggers, because
  "a `<label>` pointing at nothing is a lie to both the browser and the accessibility tree".
  `field-kit.tsx:20-36`.
- **Named-field Zod failure messages** — `describeInvalidValues` maps `issue.path[0]` through a
  30-entry `VALUE_LABELS` table, because autosave retries the SAME rejected payload and a generic
  message produced a permanent retry loop with no way to find the offending field.
  `apps/web/app/(app)/camps/[slug]/registration/actions.ts:59-119`.

### 2.7 MV / artwork registration (same spine, different questions)

- **The group IS the project** — creation reuses `prepareCampCreate` / `createCampWrites` so dedupe,
  slugging and creator-becomes-lead are shared. `apps/web/lib/project-registration-store.ts:20-25`.
- **Only columns whose meaning stays TRUE for a vehicle/artwork are written** — contact email, uploads,
  area dimensions, sound level, placement, LNT plan, grants interest.
  `apps/web/lib/project-registration-store.ts:26-33`, `:74-87`.
- **Kind-specific answers live in `questionnaire_responses.responses` under
  `proj:<groupId>:<kind-slug>`** — no activation, no `required_actions` row, so it never appears in a
  pending list, never blocks, and never collides with an activation's results.
  `apps/web/lib/project-registration-store.ts:34-46`, `:65-71`.
- **Group + membership + registration + answers commit as ONE transaction.**
  `apps/web/lib/project-registration-store.ts:106-116`.
- **The org console re-derives the key rather than importing across apps** — "what crosses the app
  boundary is the KEY FORMAT". `apps/org/lib/project-registration.ts:8-19`, `:40-45`.
- **Kind-appropriate review sections still key off the six `section_key` enum values**, so per-section
  review-thread storage works with no migration, and distinct keys per kind mean threads never collide.
  `apps/org/lib/project-review.ts:1-10`, `buildProjectSections` at `:339-348`.
- **Malformed jsonb degrades to "Not provided", never throws or mislabels** —
  `answerString` / `answerBool` / `answerStringArray`. `apps/org/lib/project-review.ts:85-115`.

### 2.8 Form 2 (the two-form split)

- **Form 2 ships as an org QUESTIONNAIRE, not a deploy** — targeting `registered_camp_leads`.
  `packages/types/src/registration.ts:53-78`.
- **Its answers MIRROR back into the same typed `registrations` columns**, because `getOfficerStatus`
  derives required officers from the sound answer and the org review screen reads the columns.
  `packages/core/src/form-2.ts:3-22`.
- **The mapping is DATA and it reports its own failures** — `mapForm2Answers` returns
  `{columns, unmapped, unfilled}`; `unfilled` is "the difference between 'the camp did not say' and
  'we lost what they said'". `packages/core/src/form-2.ts:74-89`, `:137-177`.
- **Coercions** — text trims and accepts a one-element array (single-select); count accepts numeric
  strings, truncates fractions, refuses ≤0; urls accept a bare string, cap at 4.
  `packages/core/src/form-2.ts:91-129`.

---

## 3. Data model — donor tables / columns / enums (verbatim)

### Enums (`packages/db/src/schema.ts`)

```ts
export const registrationStatusEnum = pgEnum("registration_status", [
  "draft", "submitted", "under_review", "changes_requested",
  "approved", "rejected", "withdrawn",
]);                                                        // :125-133

export const sectionKeyEnum = pgEnum("section_key", [
  "identity", "lnt", "participation",
  "size_logistics", "sound_placement", "suppliers_commerce",
]);                                                        // :135-142

export const sectionReviewStatusEnum = pgEnum("section_review_status", [
  "open", "resolved",
]);                                                        // :144-147

export const inviteKindEnum = pgEnum("invite_kind", ["member", "lead_transfer"]); // :80-83

export const membershipRoleEnum = pgEnum("membership_role", [
  "god", "org_staff", "lead", "admin", "member", "engineer",
]);                                                        // :71-78

export const groupKindEnum = pgEnum("group_kind", [
  "org", "theme_camp", "artwork", "mutant_vehicle",
]);                                                        // :49-54

export const joinabilityEnum = pgEnum("joinability", ["open", "invite_only"]);   // :56

export const groupVisibilityEnum = pgEnum("group_visibility", [
  "default", "public", "members_only", "private",
]);                                                        // :60-66   (RESERVED — unused)

export const requiredActionTypeEnum = pgEnum("required_action_type", [
  "questionnaire", "acknowledgement", "payment", "profile_update",
]);                                                        // :240-245

export const requiredActionStatusEnum = pgEnum("required_action_status", [
  "pending", "completed", "waived", "expired",
]);                                                        // :247-252

export const activationStatusEnum = pgEnum("activation_status", [
  "draft", "open", "closed",
]);                                                        // :260-264
```

> `required_action_type` and `required_action_status` are **byte-identical** to Camp 404's
> (`packages/db/src/schema.ts:118`, `:125`) — the donor states they are "ported 1:1 from Camp 404's
> pattern" (`packages/db/src/schema.ts:239`, `:1281`).
> `activation_status` is identical too. `questionnaire_scope` DIVERGES: donor is
> `["everyone", "individual", "opt_in"]` (`:254-258`) vs Camp 404's
> `["everyone","team","team_leads","individual","opt_in"]`.

### `registrations` (`packages/db/src/schema.ts:1074-1168`)

```
id                     uuid  pk default random
group_id               uuid  not null → groups.id ON DELETE CASCADE
edition_id             uuid  not null → editions.id ON DELETE CASCADE
status                 registration_status not null default 'draft'

s1_contact_email       text          s1_alt_contact_name   text
s1_alt_contact_phone   text          s1_alt_contact_email  text
s2_lnt_plan            text          s2_lnt_lead_name      text
s2_lnt_lead_phone      text          s2_lnt_lead_email     text
s3_participation_plan  text
s3_operating_hours     jsonb  $type<string[]> not null default []
s3_schedule_detail     text          s3_gifting_food       boolean
s4_expected_population integer
s4_first_arrival_date  date   (mode: "string")
s4_work_access_passes  integer       s4_area_dimensions    text
s4_layout_upload_urls  jsonb  $type<string[]> not null default []
s5_amplified_music     text          s5_sound_plan         text
s5_placement_first_choice text       s5_placement_second_choice text
s5_neighbour_request   text          s5_family_friendly    text
s6_suppliers_note      text          s6_paid_performers    boolean
s6_fee_structure       text          s6_expected_budget_zar integer
s6_plug_and_play_ack   boolean
grants_interest        boolean        -- nullable TRI-STATE: null = not asked yet
completed_sections     jsonb  $type<string[]> not null default []
submitted_at           timestamp      decided_at           timestamp
decided_by_user_id     uuid → users.id ON DELETE SET NULL
decision_reason        text           -- migration 0025
created_at / updated_at timestamp not null defaultNow()

UNIQUE INDEX registrations_group_edition_idx (group_id, edition_id)
INDEX        registrations_edition_status_idx (edition_id, status)
```

### `invites` (`packages/db/src/schema.ts:1042-1064`)

```
id                uuid pk default random
group_id          uuid not null → groups.id ON DELETE CASCADE
token             text not null UNIQUE
kind              invite_kind not null default 'member'
created_by_user_id uuid → users.id ON DELETE SET NULL
expires_at        timestamp (nullable — null never expires)
used_by_user_id   uuid → users.id ON DELETE SET NULL
used_at           timestamp
created_at        timestamp not null defaultNow()

INDEX invites_group_idx (group_id)
```

### `required_actions` (`packages/db/src/schema.ts:1443-1479`)

```
id           uuid pk default random
user_id      uuid not null → users.id ON DELETE CASCADE
edition_id   uuid not null → editions.id ON DELETE CASCADE   -- migration 0024
type         required_action_type not null
action_key   text not null
version      text
activation_id uuid → questionnaire_activations.id ON DELETE SET NULL
title        text not null
blocking     boolean not null default true
status       required_action_status not null default 'pending'
due_at       timestamp
created_at   timestamp not null defaultNow()
completed_at timestamp

UNIQUE INDEX required_actions_user_edition_action_idx (user_id, edition_id, action_key)
        -- "The edition sits in the MIDDLE so the index still serves a lookup by user alone"
INDEX        required_actions_user_status_idx (user_id, status)
```

> **Camp 404's `required_actions` has NO `edition_id`.** The donor's per-edition uniqueness key is the
> single biggest structural difference in the gate engine, and the entire justification is in the code
> comment at `apps/web/lib/required-actions.ts:32-42`.

### `section_reviews` (`:1229-1250`) and `section_review_replies` (`:1262-1279`)

```
section_reviews:
  id uuid pk · registration_id uuid not null → registrations.id CASCADE
  section_key section_key not null · status section_review_status not null default 'open'
  comment text not null · reviewer_id uuid → users.id SET NULL
  created_at / updated_at timestamp not null defaultNow()
  INDEX section_reviews_registration_idx (registration_id)

section_review_replies:
  id uuid pk · review_id uuid not null → section_reviews.id CASCADE
  author_user_id uuid → users.id SET NULL · body text not null
  created_at timestamp not null defaultNow()
  INDEX section_review_replies_review_idx (review_id)
```

### `memberships` (`:752-789`) — the invite's write target

```
id uuid pk · user_id uuid not null → users.id CASCADE
group_id uuid not null → groups.id CASCADE
role membership_role not null default 'member'
ref_code text          -- 'MAH-M017'; nullable (org/god memberships carry none)
created_at timestamp not null defaultNow()

UNIQUE INDEX memberships_user_group_idx      (user_id, group_id)
INDEX        memberships_group_idx           (group_id)
UNIQUE INDEX memberships_group_ref_code_idx  (group_id, ref_code)
```

### `groups` (`:717-746`)

```
id uuid pk · kind group_kind not null · name text not null
name_normalized text not null · slug text not null · description text
joinability joinability not null default 'invite_only'
visibility group_visibility not null default 'default'   -- RESERVED
created_by_user_id uuid → users.id SET NULL
created_at / updated_at timestamp not null defaultNow()

UNIQUE INDEX groups_kind_name_normalized_idx (kind, name_normalized)
UNIQUE INDEX groups_slug_idx (slug)
```

### `editions` (`:574-582`)

```
id uuid pk · name text not null · year integer not null UNIQUE
start_date date (string) not null · end_date date (string) not null
is_active boolean not null default false · created_at timestamp not null defaultNow()
```

### `users` (`:283-318`) — only the columns this unit touches

```
id uuid pk · auth_user_id text not null UNIQUE · email text
username text                       -- migration 0016; stored AS ENTERED
sanitized_at timestamp              -- the tombstone
UNIQUE INDEX users_username_lower_idx ON lower(username)
```

### Relevant migrations

`0016_romantic_captain_universe.sql` (username), `0022_redundant_luckman.sql`,
`0024_lively_maverick.sql` (per-edition `required_actions`), `0025_decision_reason.sql`,
`0027_decision_reason_invariant.sql`, `0028_questionnaire_responses_group_scope.sql`.
Total 29 migrations, `packages/db/migrations/0000_stormy_raider.sql` … `0028_…`.

---

## 4. Public API surface (signatures verbatim)

### `packages/core/src/registration-state.ts`

```ts
export const REGISTRATION_TRANSITIONS: Record<RegistrationStatus, readonly RegistrationStatus[]>
export function canTransitionRegistration(from: RegistrationStatus, to: RegistrationStatus): boolean
export function assertRegistrationTransition(from: RegistrationStatus, to: RegistrationStatus): RegistrationStatus
export const CAMP_ACTIONS = ["submit", "resubmit", "withdraw", "reopen"] as const
export type CampAction = (typeof CAMP_ACTIONS)[number]
export function canCampSubmit(from: RegistrationStatus): boolean
export function canCampWithdraw(from: RegistrationStatus): boolean
export function resolveCampAction(from: RegistrationStatus, action: CampAction): RegistrationStatus
export const SECTION_REVIEW_TRANSITIONS: Record<SectionReviewStatus, readonly SectionReviewStatus[]>
export function canTransitionSectionReview(from: SectionReviewStatus, to: SectionReviewStatus): boolean
export function canReplyToSectionReview(ctx: { campRole: MembershipRole | null; isOrgStaff: boolean }): boolean
```

### `packages/core/src/entitlements.ts`

```ts
export interface RegistrationLike { status: RegistrationStatus }
export function isRegistered(registrations: readonly RegistrationLike[]): boolean
export function isApprovedRegistration(registration: RegistrationLike | null | undefined): boolean
export function isSubmittable(completedSections: readonly string[]): boolean
export function missingSections(completedSections: readonly string[]): SectionKey[]
export function missingForm2Sections(completedSections: readonly string[]): SectionKey[]
export function isFullyComplete(completedSections: readonly string[]): boolean
```

### `packages/core/src/registration-sections.ts`

```ts
export interface RegistrationSectionData { /* 21 optional fields — see §5 */ }
export function isSectionComplete(key: SectionKey, data: RegistrationSectionData): boolean
export function completedSectionsFor(data: RegistrationSectionData): SectionKey[]
```

### `packages/core/src/invite.ts`

```ts
export interface InviteLike { kind: InviteKind; expiresAt: Date | null; usedAt: Date | null; usedByUserId: string | null }
export type InviteRejection = "already_used" | "expired" | "self_member"
export interface InviteCheckResult { ok: boolean; reason: InviteRejection | null }
export function canRedeemInvite(invite: InviteLike, now: Date = new Date()): InviteCheckResult
export function canRedeemInviteAs(invite: InviteLike, redeemer: { isMember: boolean }, now: Date = new Date()): InviteCheckResult
export function inviteRejectionMessage(reason: InviteRejection): string
```

### `packages/core/src/invite-view.ts`

```ts
export type InviteViewStatus = "valid" | "already_used" | "expired" | "not_found"
export type InviteCta = "authenticate" | "redeem" | "open_camp" | "none"
export interface InviteViewer { signedIn: boolean; isMember?: boolean }
export interface InviteView { status: InviteViewStatus; cta: InviteCta; showCamp: boolean; kind: InviteKind | null }
export function resolveInviteView(invite: InviteLike | null, viewer: InviteViewer, now: Date = new Date()): InviteView
export const PENDING_INVITE_COOKIE = "quagga.pending_invite"
export const PENDING_INVITE_MAX_AGE_SECONDS = 60 * 60
export const INVITE_RESUME_PATH = "/join/continue"
export const INVITE_AUTH_PARAM = "next"
export const INVITE_AUTH_MARKER = "invite"
export function isWellFormedInviteToken(value: unknown): value is string
export function invitePath(token: string): string
export function authPathForInvite(mode: "sign-in" | "sign-up"): string
export function wantsInviteResume(value: unknown): boolean
export function inviteExpiryLabel(expiresAt: Date, now: Date = new Date()): string
```

### `packages/core/src/questionnaire-engine.ts`

```ts
export const BURNER_BIO_ACTION_KEY = "burner_bio"
export interface RequiredActionLike { actionKey: string; blocking: boolean; status: "pending" | "completed" | "waived" | "expired" }
export function firstBlockingAction<T extends RequiredActionLike>(actions: readonly T[]): T | null
export function isParticipantFacingActivation(audience: AudienceSpec | null | undefined): boolean
```

### `packages/core/src/questionnaire-activation.ts`

```ts
export function resolveActivationDefinition<T>(snapshot: T | null | undefined, liveFallback: T): T
export function activationRequiredActionKey(activationId: string): string
export function parseActivationActionKey(actionKey: string): string | null
export interface ActivationLike { id: string; title: string; blocking: boolean; dueAt: Date | null }
export interface RequiredActionInsert { userId; type: "questionnaire"; actionKey; activationId; title; blocking; status: "pending"; dueAt: Date | null }
export function buildActivationRequiredActions(activation: ActivationLike, userIds: readonly string[]): RequiredActionInsert[]
export interface RequiredActionCompletion { status: "completed"; completedAt: Date }
export function completeRequiredAction(now: Date = new Date()): RequiredActionCompletion
export interface ResponseLike { activationId: string | null; completedAt: Date | null }
export function isActivationResponseComplete(activationId: string, response: ResponseLike | null | undefined): boolean
export interface ActivationCompletion { sent: number; completed: number; pending: number }
export function tallyActivationCompletion(actions: readonly { status: string }[]): ActivationCompletion
```

### `packages/core/src/member-ref-code.ts`

```ts
export function deriveCampPrefix(name: string): string
export function disambiguateCampPrefix(name: string, taken: Iterable<string>): string
export function formatMemberRefCode(prefix: string, sequence: number): string
export function isValidMemberRefCode(code: string): boolean
export function parseMemberRefCode(code: string): { prefix: string; sequence: number } | null
export function establishedCampPrefix(existingCodes: Iterable<string>): string | null
export function nextMemberSequence(existingCodes: Iterable<string>): number
```

### `packages/core/src/name-dedupe.ts`

```ts
export function normalizeName(input: string): string
export function isExactNormalizedMatch(a: string, b: string): boolean
export const SIMILARITY_WARN_THRESHOLD = 0.55
export function trigramSimilarity(a: string, b: string): number
export function isSimilarName(a: string, b: string, threshold: number = SIMILARITY_WARN_THRESHOLD): boolean
```

### `packages/core/src/username.ts`

```ts
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
export const UNNAMED_BURNER = "Unnamed burner"
export const USERNAME_HELP = "Optional — how you appear to other burners. 3–20 characters: letters, numbers and underscores. You can change it later."
export const RESERVED_USERNAMES: readonly string[]      // 90 entries
export function normalizeUsername(raw: string): string
export function isReservedUsername(raw: string): boolean
export type UsernameValidation = { ok: true; username: string; normalized: string } | { ok: false; error: string }
export function validateUsername(raw: string): UsernameValidation
export function publicMemberName(username: string | null | undefined, options?: { sanitizedAt?: Date | null }): string
```

### `packages/core/src/form-2.ts`

```ts
export interface Form2Columns { s4ExpectedPopulation: number | null; s4FirstArrivalDate: string | null; s4AreaDimensions: string | null; s4LayoutUploadUrls: string[] | null; s5AmplifiedMusic: string | null; s5SoundPlan: string | null; s5PlacementFirstChoice: string | null; s5FamilyFriendly: string | null }
export const FORM_2_FIELD_MAP: Readonly<Record<string, { column: keyof Form2Columns; kind: ColumnKind }>>
export const FORM_2_COLUMNS: readonly (keyof Form2Columns)[]
export interface Form2MappingResult { columns: Partial<Form2Columns>; unmapped: string[]; unfilled: (keyof Form2Columns)[] }
export function mapForm2Answers(responses: QuestionnaireResponses): Form2MappingResult
```

### `packages/types/src/registration.ts`

```ts
export const RegistrationStatus = z.enum([...7])           // :11-19
export const SectionKey = z.enum([...6])                   // :33-40
export const SECTION_KEYS: readonly SectionKey[]           // :44-51
export const FORM_1_SECTION_KEYS: readonly SectionKey[] = ["identity","lnt","participation","suppliers_commerce"]   // :79-84
export const FORM_2_SECTION_KEYS: readonly SectionKey[] = ["size_logistics","sound_placement"]                      // :95-98
export function formForSection(key: SectionKey): 1 | 2     // :101-103
export const SECTION_LABELS: Record<SectionKey, string>    // :106-113
export const SectionReviewStatus = z.enum(["open","resolved"])                      // :119
export const OperatingHours = z.enum(["morning","day","night","late_night"])        // :123
export const MAX_LAYOUT_UPLOADS = 4                                                 // :127
```

### `apps/web/lib/required-actions.ts`

```ts
export function actionRoute(actionKey: string): string | null
export async function ensureRequiredAction(input: { userId: string; editionId: string; actionKey: string; type: "questionnaire" | "acknowledgement" | "payment" | "profile_update"; title: string; blocking?: boolean }): Promise<void>
export async function completeRequiredAction(userId: string, editionId: string, actionKey: string): Promise<void>
export const listRequiredActions = cache(async function listRequiredActions(userId: string): Promise<RequiredActionLike[]>)
```

### `apps/web/lib/session.ts`

```ts
export interface CampUser { id: string; authUserId: string; email: string | null; username: string | null }
export async function getOrgGroup(): Promise<{ id: string } | null>
export const ensureCampUser = cache(async function ensureCampUser(authUser: AuthenticatedUser): Promise<CampUser | null>)
export async function getCurrentCampUser(): Promise<CampUser | null>
export async function requireCampUser(): Promise<CampUser>
export async function pendingBlockingRoute(userId: string): Promise<string | null>
export async function viewerIsGated(): Promise<boolean>
export async function enforceGate(userId: string, currentPath?: string): Promise<void>
export async function requireOnboardedUser(): Promise<CampUser>
```

### `apps/web/lib/registration-store.ts`

```ts
export const EDITABLE_STATUSES: readonly RegistrationStatus[] = ["draft", "changes_requested"]
export function isEditableStatus(status: RegistrationStatus): boolean
export interface RegistrationCampContext { group: {id;name;slug;description}; editionId; editionYear; editionName; role: MembershipRole | null }
export async function getRegistrationCampContext(slug: string, viewerId: string | null, edition: { id: string; year: number; name: string }): Promise<RegistrationCampContext | null>
export type RegistrationRow = typeof schema.registrations.$inferSelect
export async function getRegistration(groupId: string, editionId: string): Promise<RegistrationRow | null>
export interface CampReviewReply { id; authorUserId: string | null; authorName: string; isOrg: boolean; body: string; createdAt: Date }
export interface CampSectionReview { id; sectionKey: string; status: SectionReviewStatus; comment: string; createdAt: Date; replies: CampReviewReply[] }
export async function getSectionReviews(registrationId: string, _editionId: string): Promise<CampSectionReview[]>
export interface SupplierOption { id; name; services: string | null; standing: SupplierStanding; caution: boolean; onboardingComplete: boolean }
export async function listSuppliersForPicker(editionId: string): Promise<SupplierOption[]>
export async function getDeclaredSupplierIds(registrationId: string): Promise<string[]>
export interface DeclaredSupplier { id: string; name: string; standing: SupplierStanding }
export async function getDeclaredSuppliers(registrationId: string): Promise<DeclaredSupplier[]>
export interface RegistrationValues { /* 29 fields + supplierIds */ }
export type SaveDraftResult = { ok: true; completedSections: string[]; created: boolean } | { ok: false; error: string }
export async function saveRegistrationDraft(input: { group: { id: string; name: string }; editionId: string; values: RegistrationValues }): Promise<SaveDraftResult>
export type TransitionResult = { ok: true; status: RegistrationStatus; registrationId: string } | { ok: false; error: string }
export async function applyCampAction(input: { groupId: string; editionId: string; action: CampAction }): Promise<TransitionResult>
```

### `apps/web/lib/invites-store.ts`

```ts
export interface InviteRow { id; token; kind: InviteKind; expiresAt: Date | null; usedAt: Date | null; createdAt: Date }
export async function createInvite(input: { groupId: string; createdByUserId: string; kind: InviteKind; ttlDays?: number }): Promise<InviteRow>
export async function revokeInvite(inviteId: string, groupId: string): Promise<void>
export async function listInvites(groupId: string): Promise<InviteRow[]>
export interface InvitePreview { token; kind; groupId; groupName; groupSlug; groupDescription: string | null; inviterName: string | null; expiresAt: Date | null; usedAt: Date | null; usedByUserId: string | null; registered: boolean }
export function previewAsInviteLike(preview: InvitePreview): InviteLike
export async function getInvitePreview(token: string, editionId?: string): Promise<InvitePreview | null>
export type RedeemResult = { ok: true; slug: string } | { ok: false; error: string }
export async function redeemInvite(token: string, userId: string): Promise<RedeemResult>
```

### `apps/web/lib/pending-invite.ts` / `invite-flow.ts`

```ts
export async function setPendingInvite(token: string): Promise<void>
export async function readPendingInvite(): Promise<string | null>
export async function clearPendingInvite(token?: string): Promise<void>
export async function completeInviteJoin(token: string, user: CampUser): Promise<RedeemResult>
```

### Server actions

```ts
// apps/web/app/join/[token]/actions.ts
export async function acceptInviteAction(formData: FormData): Promise<void>
// apps/web/app/join/continue/actions.ts
export async function confirmInviteJoinAction(): Promise<void>
// apps/web/app/(app)/camps/[slug]/registration/actions.ts
export async function saveRegistrationDraftAction(slug: string, rawValues: unknown): Promise<SaveDraftResult>
export async function submitRegistrationAction(slug: string): Promise<TransitionResult>
export async function reopenRegistrationAction(slug: string): Promise<TransitionResult>
export async function withdrawRegistrationAction(slug: string): Promise<TransitionResult>
export type ReplyResult = { ok: true } | { ok: false; error: string }
export async function replyToSectionReviewAction(slug: string, raw: z.input<typeof ReplyToReviewInput>): Promise<ReplyResult>
// apps/web/app/(app)/camps/new/actions.ts
export type CreateCampActionResult = { status: "created"; slug: string } | { status: "error"; message: string } | { status: "warn"; warnings: string[] }
export async function createCampAction(raw: unknown): Promise<CreateCampActionResult>
// apps/web/app/(app)/camps/[slug]/actions.ts
export type CreateInviteResult = { ok: true; invite: InviteRow } | { ok: false; error: string }
export async function createInviteAction(raw: unknown): Promise<CreateInviteResult>
export async function revokeInviteAction(raw: unknown): Promise<{ ok: boolean; error?: string }>
// apps/web/app/(app)/onboarding/actions.ts
export async function saveOnboardingBioAction(responses: unknown, privacyFlags: unknown, final: boolean, extras?: unknown): Promise<SaveResult>
export type UsernameCheck = { status: "available" } | { status: "taken"; message: string } | { status: "invalid"; message: string }
export async function checkUsernameAvailabilityAction(candidate: unknown): Promise<UsernameCheck>
// apps/org/lib/actions/registrations.ts
export async function decideRegistration(raw: z.input<typeof DecideInput>): Promise<ActionResult>
export async function addSectionReview(raw: z.input<typeof AddReviewInput>): Promise<ActionResult>
export async function setSectionReviewStatus(raw: z.input<typeof SetReviewStatusInput>): Promise<ActionResult>
```

### `apps/org/lib/org-logic.ts` (review-action layer)

```ts
export const REVIEW_ACTIONS = ["start_review", "approve", "request_changes", "reject"] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]
export const REVIEW_ACTION_TARGET: Record<ReviewAction, RegistrationStatus> = {
  start_review: "under_review", approve: "approved",
  request_changes: "changes_requested", reject: "rejected",
}
export const REVIEW_ACTION_LABELS: Record<ReviewAction, string>
export function resolveReviewActionPath(from: RegistrationStatus, action: ReviewAction): RegistrationStatus[]
export function resolveReviewAction(from: RegistrationStatus, action: ReviewAction): RegistrationStatus
export function isReviewActionAvailable(from: RegistrationStatus, action: ReviewAction): boolean
```

### `packages/ui`

```ts
export interface WizardProps { sections: WizardSectionInput[]; currentId?: string; variant?: "rail" | "strip"; onSelect?: (id: string) => void; className?: string }
export function Wizard(props: WizardProps)
export type WizardSectionState = "done" | "current" | "todo" | "blocked"
export interface WizardSectionInput { id: string; label: string; done?: boolean; blocked?: boolean }
export interface WizardProgress { sections: WizardSection[]; completed: number; total: number; label: string; currentId: string | null }
export function deriveWizardProgress(sections: WizardSectionInput[], currentId?: string): WizardProgress
export interface AckRowProps extends CheckboxProps { children: React.ReactNode; icon?: React.ReactNode; rowClassName?: string }
```

---

## 5. Validation + edge-case rules, digit-exact

### Section completeness predicates (`packages/core/src/registration-sections.ts:72-111`)

| Section | Required for "complete" |
|---|---|
| `identity` | `campName` filled AND `campDescription` filled AND `isWithinWordLimit(campDescription)` (≤ **60** words) AND `s1ContactEmail` filled |
| `lnt` | `s2LntPlan` + `s2LntLeadName` + `s2LntLeadPhone` + `s2LntLeadEmail` all filled |
| `participation` | `s3ParticipationPlan` filled AND `(s3OperatingHours?.length ?? 0) > 0` AND `s3GiftingFood` is a real boolean |
| `size_logistics` | `s4ExpectedPopulation` finite **and > 0** AND `s4FirstArrivalDate` filled AND `s4AreaDimensions` filled |
| `sound_placement` | `s5AmplifiedMusic` + `s5PlacementFirstChoice` + `s5FamilyFriendly` filled AND (`isNoAmplifiedSound(s5AmplifiedMusic)` OR `s5SoundPlan` filled) |
| `suppliers_commerce` | `s6PaidPerformers` is a boolean AND `s6FeeStructure` filled AND **`s6PlugAndPlayAck === true`** (strict identity, not truthiness) |

Helpers: `filled` = `typeof === "string" && trim().length > 0`; `answered` = `typeof === "boolean"`;
`positive` = `typeof === "number" && Number.isFinite && > 0`. (`:57-69`)

Optional fields never block completion: alt contact, WAPs, layout uploads, schedule detail, supplier
list, budget. (`:13-15`)

### `isNoAmplifiedSound` (`packages/core/src/sound.ts:61-69`)

- `null`/`""` ⇒ `true` (treated as no amplification).
- Any digit in the value ⇒ `false` (so `"Level 1 — Car stereo"` is amplified).
- Otherwise matches `/\b(no|none|acoustic|silent|zero)\b/` or contains `"no amplif"`.

### `SOUND_SCALE` — the 5 stored values verbatim (`packages/core/src/sound.ts:20-50`)

```
"No amplified sound"
"Level 1 — Car stereo"
"Level 2 — Party speakers"
"Level 3 — Small rig / dancefloor"
"Level 4 — Large rig"
```

### `PLACEMENT_ZONES_2027` — 7 stored values verbatim (`packages/core/src/placement-zones.ts:17-57`)

```
"Binnekring — front line (12ish)"
"Binnekring — back line"
"Loud Zone (northwest binnekring)"
"Mid-city (3ish–9ish roads)"
"Outer roads (back of the city)"
"Quiet Camping (behind the dunes)"
"No preference — place us where it works"
```
`getPlacementZones(year)` falls back to the 2027 list for any unlisted year (`:67-69`).

### Zod boundary caps on the wizard payload (`apps/web/app/(app)/camps/[slug]/registration/actions.ts:121-161`)

```
campDescription        max 4000     s1ContactEmail          max 200
s1AltContactName       max 200      s1AltContactPhone       max 60
s1AltContactEmail      max 200      s2LntPlan               max 8000
s2LntLeadName          max 200      s2LntLeadPhone          max 60
s2LntLeadEmail         max 200      s3ParticipationPlan     max 8000
s3OperatingHours       array(OperatingHours).max(4).default([])
s3ScheduleDetail       max 8000
s4ExpectedPopulation   int 0..1_000_000
s4FirstArrivalDate     max 40       s4WorkAccessPasses      int 0..100_000
s4AreaDimensions       max 200
s4LayoutUploadUrls     array(url().max(2000)).max(4).default([])
s5AmplifiedMusic       max 200      s5SoundPlan             max 8000
s5PlacementFirstChoice max 200      s5PlacementSecondChoice max 200
s5NeighbourRequest     max 500      s5FamilyFriendly        max 500
s6SuppliersNote        max 4000     s6FeeStructure          max 8000
s6ExpectedBudgetZar    int 0..1_000_000_000
supplierIds            array(uuid()).max(100).default([])
```
`nullableText(max)` treats `""` as `null`. `nullableInt(max)` **rejects** decimals and negatives rather
than coercing — "expected population: 4.5 is a mistake, not an intention" (`:42-49`).

### Other digit-exact constants

- Invite TTL default **30 days**; token `randomBytes(18).toString("base64url")` = **24 base64url chars**;
  grammar `/^[A-Za-z0-9_-]{16,128}$/` (bounds deliberately generous so a future token-length change does
  not silently reject live links). `apps/web/lib/invites-store.ts:23-25`, `:34-36`;
  `packages/core/src/invite-view.ts:149-151`.
- Pending-invite cookie: name `"quagga.pending_invite"`, `maxAge = 60 * 60` (**3600 s**),
  `httpOnly: true`, `sameSite: "lax"`, `secure: NODE_ENV === "production"`, `path: "/"`.
  `packages/core/src/invite-view.ts:137-140`, `apps/web/lib/pending-invite.ts:27-33`.
- `inviteExpiryLabel`: `days = Math.ceil((expiresAt - now) / 86_400_000)`; `≤0` ⇒ `"expires today"`,
  `1` ⇒ `"expires in 1 day"`, else `"expires in N days"`. `packages/core/src/invite-view.ts:182-190`.
- Camp description word limit **60** (`packages/core/src/word-count.ts:6`); counting is
  `trim().split(/\s+/).length`, empty ⇒ 0 (`:13-18`).
- Similarity warn threshold **0.55** (`packages/core/src/name-dedupe.ts:28`).
- Camp name Zod: `min(2, "Give your camp a name.")`, `max(120)`; description `max(2000)` AND
  `countWords ≤ 60`. `apps/web/app/(app)/camps/new/actions.ts:10-23`.
- `MAX_LAYOUT_UPLOADS = 4` (`packages/types/src/registration.ts:127`), enforced in the Zod schema, in
  `LayoutUploads`, and again in `form-2.ts` `urls()` `.slice(0, 4)`.
- Upload route: `MAX_BYTES = 8 * 1024 * 1024`; `ALLOWED = {image/png, image/jpeg, image/webp, image/gif}`;
  501 when Blob is unconfigured, 401 signed-out, 403 gated, 400 no file, 413 too large.
  `apps/web/app/api/registration/upload/route.ts:15-60`.
- Decision reason `z.string().trim().max(2000).optional()`; section-review comment
  `.trim().min(1, "Add a comment.").max(2000)`; reply body `.trim().min(1, "Write a reply.").max(2000)`.
  `apps/org/lib/actions/registrations.ts:104-108`, `:224-228`;
  `apps/web/app/(app)/camps/[slug]/registration/actions.ts:304-307`.
- Reply thread `MAX_REPLY = 2000` client-side (`section-reply-thread.tsx:19`).
- Relative-time labels in the reply thread: `"today"`, `"yesterday"`, `"N days ago"` (< 7),
  `"N week(s) ago"` (< 5 weeks), else `toLocaleDateString("en-ZA", {day:"numeric", month:"short"})`.
  `section-reply-thread.tsx:22-30`.
- Ref-code retry loop: **5** attempts (`apps/web/lib/groups-store.ts:280`).
- Ref-code disambiguation candidate space: `core + "A".."Z"` then `core + 2..999`
  (`packages/core/src/member-ref-code.ts:60-61`).
- Username availability input cap: `USERNAME_MAX_LENGTH * 10` = **200**
  (`apps/web/app/(app)/onboarding/actions.ts:42`).
- Autosave: debounce **1500 ms**, safety-net interval **20000 ms**
  (`registration-wizard.tsx:224`, `:232`).

### Error/copy strings worth stealing verbatim

```
"This invite link has already been used. Ask the camp for a fresh one."   invite.ts:71
"This invite link has expired. Ask the camp for a fresh one."             invite.ts:73
"You're already a member of this camp."                                   invite.ts:75
"This registration is locked while AfrikaBurn reviews it."                registration-store.ts:451
"Complete all six sections before submitting."                            registration-store.ts:610  (STALE — see §8)
"This registration changed since you opened it — reload and try again."   registration-store.ts:653 + org registrations.ts:189
"A rejection needs a reason for the camp."                                org registrations.ts:133
"Tell the camp what to change — a reason is required."                    org registrations.ts:134
"That username is already taken. Try another."                            bio-store.ts:208
"Usernames need at least 3 characters." / "…at most 20 characters."       username.ts:194, :199
"Usernames can only use letters, numbers and underscores."                username.ts:209
"Usernames must start with a letter."                                     username.ts:213
"Usernames can't end with an underscore."                                 username.ts:216
"Usernames can't contain two underscores in a row."                       username.ts:221
"That username is reserved. Please pick a different one."                 username.ts:227
"Only a camp lead can create invites." / "…revoke invites."               camps/[slug]/actions.ts:84, :115
"Only the current lead can transfer the lead role."                       camps/[slug]/actions.ts:89
"Only a camp lead can edit the registration."                             registration/actions.ts:195
"Only members of this camp (or AfrikaBurn staff) can reply."              registration/actions.ts:384
"A camp of this kind already uses that name. Pick another."               camps/new/actions.ts:52
"Invites are one-time and expire after a week. Your camp lead can send you a fresh link."  join/[token]/page.tsx:71-72  (STALE — see §8)
"Joining a camp is free — the platform never holds funds."                join/[token]/page.tsx:229
"This invite can only be used once, by this account."                     join/continue/page.tsx:102
```

---

## 6. UX behaviours worth porting

1. **Signed-out-first invite landing.** The page never bounces a signed-out visitor to auth — it renders
   the invite. `AppShell minimalNav` for a stranger; full nav for a signed-in viewer.
   `join/[token]/page.tsx:29-37`, `:218`.
2. **A gated viewer sees exactly what a signed-out viewer sees** on the invite page; the gate is enforced
   by the *accept action*, so redirecting the page would hide nothing and would silently throw the invite
   away. `join/[token]/page.tsx:39-43`.
3. **Three cards, one CTA.** `NotFoundCard` (TicketX icon), `SpentCard` (ClockAlert, names no camp),
   `InviteCard` (registered badge, camp name, blurb, inviter avatar with two-letter initials, expiry
   line). `join/[token]/page.tsx:57-178`.
4. **CTA label is derived, not hard-coded** — `"Accept lead role"` / `"Open {camp}"` / `"Join {camp}"`.
   `join/[token]/page.tsx:114-119`.
5. **`JoinButton` uses `useFormStatus`** so a server-side redirect that takes real time still shows
   `"Joining…"` — the fix for double-clicks. `join-button.tsx:16-22`, rationale at
   `join/continue/page.tsx:105-109`.
6. **"Not you? Switch account before joining."** on the confirm page. `join/continue/page.tsx:114-120`.
7. **Locked registration summary carries a status banner per state** — 7 entries with title, body, icon
   and tone. `registration-summary.tsx:42-80+`.
8. **`window.confirm` copy is generated per status** by `withdrawConsequence(status, editionYear)`, and
   the same function backs both the wizard's inline control and the locked view's button, so the action
   never warns two different ways. `withdraw-registration.tsx:32-62`, used at
   `registration-wizard.tsx:275`.
9. **Copy-to-clipboard with a 1500 ms `Check` flash and a toast fallback** — in both `CampInvites` and
   `MemberRefCode`. `camp-invites.tsx:66-74`, `member-ref-code.tsx:22-30`.
10. **Two ref-code presentations** — `prominent` banner ("Your camp reference" + EFT explainer) and an
    inline monospace chip. `member-ref-code.tsx:32-73`.
11. **"Still needed:" chip row** listing the incomplete section labels above the submit button.
    `registration-wizard.tsx:838-861`.
12. **Optimistic invite list** — `setInvites(prev => [result.invite, ...prev])` on create, filter on
    revoke, plus `router.refresh()`. `camp-invites.tsx:37-64`.

---

## 7. Test coverage

**Core (DB-free, `packages/core/src/__tests__`)**

- `registration-state.test.ts` — 19 tests. Notable: *"never lists a self-transition and never targets an
  unknown status"* (a property test over the whole table, `:84`); *"lets a WITHDRAWN registration be
  reopened as a draft"* (`:49`); *"treats rejected as terminal — AfrikaBurn's decision, not the camp's"*
  (`:42`); *"exposes exactly the four camp actions"* (`:136`).
- `entitlements.test.ts` — 8 tests, including *"does NOT require the Form 2 sections"* (`:49`) and
  *"lists only the outstanding FORM 1 sections"* (`:74`).
- `registration-sections.test.ts` — 13 tests, one per predicate plus the 60-word failure and the
  "sound plan only when amplified" branch; also covers `SOUND_SCALE` and `getPlacementZones`.
- `invite.test.ts` — 10 tests including *"used state wins over expiry"* (`:39`), *"treats the exact
  expiry instant as expired (boundary)"* (`:52`), *"still enforces single-use before the membership
  check"* (`:79`), and *"has copy for every reason"* (`:90`).
- `invite-view.test.ts` — 258 lines covering all four states × both viewers.
- `questionnaire-engine.test.ts` — 8 tests: blocking/pending filtering, `waived`/`expired` ignored,
  *"takes the FIRST pending blocker — input order is priority"* (`:43`), and the four
  `isParticipantFacingActivation` cases including *"treats a null/undefined audience (the Burner Bio
  spine) as participant-facing"* (`:90`).
- `questionnaire-activation.test.ts` — key round-trip, dedupe, empty audience, non-blocking carry-through,
  completion patch, tally.
- `form-2.test.ts` — 16 tests including *"REPORTS a renamed question rather than silently dropping the
  column"* (`:46`), *"truncates a fractional count — 40.7 people is 40 people"* (`:132`), *"caps at four,
  matching the wizard's own limit"* (`:150`), *"keeps the field map and the column list in step"* (`:168`).
- `member-ref-code.test.ts` — 12 tests, incl. *"is a pure function of (name, taken) — order of taken does
  not matter"* (`:55`).
- `username.test.ts` — 21 tests, incl. *"accepts mixed case and STORES IT AS ENTERED"* (`:85`),
  *"treats case variants as THE SAME handle (impersonation guard)"* (`:97`), *"every reserved entry is
  itself lower-cased and unique"* (`:152`), *"never dumps a regex or a character class at the user"*
  (`:174`), *"REGRESSION: the placeholder can never look like an email"* (`:205`).
- `name-dedupe.test.ts` + `dedupe-integration.test.ts` — normalisation, symmetry, bounds, the 0.55
  threshold, and *"exact match takes precedence over a similarity warning"* (`:56`).

**apps/web (`apps/web/lib/__tests__`)**

- `session-guards.test.ts` — 22 tests. The gate spine is covered end to end: *"routes a questionnaire
  activation key to its fill page"*, *"falls back to /onboarding for a key with no page built for it"*,
  *"does NOT redirect when the caller is already on the blocking route"*, *"is false for a signed-out
  visitor — chrome must still render"*, plus the whole `bootstrapGod` matrix (unverified email grants
  nothing; audits exactly once; audits NOTHING on a conflict) and *"REFUSES a sanitized account, and
  bootstraps nothing for it"*.
- `registration-store.test.ts` — 20 tests: the editable-status machine, the `decision_reason` clearing
  invariant on both resubmit and withdraw, TOCTOU loss reported rather than accepted, refusal to write
  once locked, server-side recomputation of `completedSections`, *"DROPS a suspended supplier posted
  straight at the write boundary"*, and *"getDeclaredSuppliers still names a supplier that has SINCE been
  suspended"*.
- `invites-store.test.ts` — 17 tests: token grammar, custom TTL, group-scoped revoke, preview leaking
  only the username, *"claims the row and grants the membership as ONE transaction"*, *"LOSES THE RACE
  gracefully: no claim, no membership"*, and three `lead_transfer` cases.
- `decision-reason-invariant.test.ts` — 3 cross-file assertions (the camp's transitions clear it; the
  summary renders it only on rejection; the wizard's copy is scoped to `changes_requested`).

**apps/org** — `registration-decision-actions.test.ts` (21 tests) covers the authz refusal, the two
reason sentences, "does NOT require a reason to approve", illegal transition writes nothing, *"throws and
audits nothing when the status moved under the reviewer"*, *"CLEARS the reason on a later transition that
carries none"*, *"notifies the camp's leads AFTER the decision is committed"*, *"commits the decision even
when the notification hook fails"*.

**e2e** (Playwright, `e2e/` workspace, real UI against a deployed preview, **no DB back doors**) —
`new-burner/onboarding-gate.spec.ts` (3 tests: every gated route redirects; only sign-out escapes;
completing the bio releases the gate), `anon/signed-out-invite-acceptance.spec.ts` (5 tests including
*"the token never appears in a url after the invite page — it rides an httpOnly cookie"*),
`camp-lead/{invites,registration,review-loop,decision-outcomes,camp-lifecycle}.spec.ts`,
`camp-member/camp-member-gate-released-by-close.spec.ts`, `new-burner/directory-and-join.spec.ts`.

> `AGENTS.md:59-69`: `turbo run test` lints and typechecks `@quagga/e2e` but **never executes Playwright**
> — the unit gate does not run a single browser.

---

## 8. Gotchas, drift and donor bugs found while reading

1. **The wizard's submit gate is STRICTER than the server's, and they disagree.**
   `registration-wizard.tsx:160` computes `allComplete = completed.size === SECTION_KEYS.length` (all six)
   and `:875` disables the submit button on `!allComplete`, while the server's `isSubmittable` gates on
   `FORM_1_SECTION_KEYS` only (`entitlements.ts:51-54`). The visible copy at `:842` still says
   *"Submit opens once all six sections are complete"*. So the Form-2 split landed in core and in the
   store but **not in the wizard UI** — a September camp cannot press Submit through the UI even though
   the server would accept it. Do not port `allComplete` as-is.
2. **The server's own refusal message is stale for the same reason** —
   `"Complete all six sections before submitting."` (`registration-store.ts:610`) is printed when the
   *Form-1* gate fails.
3. **The invite spent-card copy claims a TTL the code does not use.**
   `"Invites are one-time and expire after a week."` (`join/[token]/page.tsx:71-72`) vs
   `ttlDays ?? 30` (`invites-store.ts:35`). CONTRIBUTING.md:62-71 makes "nothing may claim something that
   isn't true" the house rule — this line breaks it.
4. **`getSectionReviews` takes a dead parameter** — `_editionId` is unused since author names moved to
   `users` ("kept so every registration loader takes the same pair", `registration-store.ts:150-153`).
5. **`replaceSupplierDeclarations` reads with the HTTP client inside a transaction** — deliberate and
   commented (`registration-store.ts:556-560`), but it means the standing re-check is *not* in the
   transaction's snapshot.
6. **`revokeInvite` "revokes" by stamping `used_at`** rather than a dedicated status
   (`invites-store.ts:59-74`), so a revoked invite is indistinguishable from a redeemed one in the data —
   `used_by_user_id` is the only discriminator, and `listInvites` filters on `usedAt IS NULL`.
7. **`resolveInviteView` collapses revoked into `already_used`** for the same reason
   (`invite-view.ts:88-93`) — which is the *desired* privacy behaviour but hides the distinction from
   the lead too.
8. **`decideRegistration`'s notification hook re-reads with the non-transactional `db` handle** after
   commit and swallows every error to `console.error` (`org registrations.ts:99-101`) — deliberate, but it
   means a camp can be approved with no notification and no signal.
9. **`apps/org/lib/project-registration.ts` is a deliberate duplicate read** of
   `apps/web/lib/project-registration-store.ts:438`'s query, because apps may not import across apps
   (`org project-registration.ts:12-19`). The **key format** `proj:<groupId>:<kind-slug>` is the contract,
   duplicated in two `KIND_SLUG` maps (`org:24-27`, `web:57-60`).
10. **`org-logic.resolveReviewActionPath` can traverse two states in one action** —
    `submitted → under_review → approved` writes only the FINAL status to the row; the intermediate
    `under_review` never exists in the data, only in the audit `meta.from`/`meta.to` pair (which records
    `from: submitted, to: approved`). If Camp 404 wants a visible "review started" state it must call
    `start_review` explicitly.
11. **`countWords` splits on whitespace only**, so `"well-run"` is one word and a 60-word Chinese
    description would count as 1. (`word-count.ts:8-18`.)
12. **`isNoAmplifiedSound` is a heuristic over free text** — any digit anywhere ⇒ amplified. A camp
    typing `"none, we have 0 speakers"` is classified as amplified and then required to write a sound plan.
13. **`ensureRequiredAction` has no `activationId`** — the app-side helper only writes static keys; the
    activation rows are built by `buildActivationRequiredActions` in core and inserted elsewhere. Two
    write paths for one table.
14. **`packages/core` has TWO `completeRequiredAction`s** — the pure patch builder
    (`questionnaire-activation.ts:100`) and the DB mutator (`apps/web/lib/required-actions.ts:79`). Same
    name, different layers; a careless import resolves the wrong one.
15. **`docs/simplification-audit.md` warns that `apps/org` and `apps/suppliers` are "close to being the
    same application twice"** — anything lifted from an app directory should be assumed to have a
    near-twin, one of which has already drifted.

---

## 9. Dependency footprint

**`packages/core` modules in this unit import NOTHING but `@quagga/types` and each other.** Verified:
`registration-sections.ts` → `@quagga/types` + `./word-count` + `./sound`; `registration-state.ts` →
`@quagga/types` only; `entitlements.ts` → `@quagga/types` only; `invite.ts` → `@quagga/types` only;
`invite-view.ts` → `@quagga/types` + `./invite`; `member-ref-code.ts`, `name-dedupe.ts`,
`word-count.ts`, `sound.ts`, `placement-zones.ts`, `god-emails.ts` → **zero imports**;
`username.ts` → `./account-sanitization` (for `DEPARTED_BURNER_NAME`) only;
`questionnaire-engine.ts` → `type AudienceSpec` from `@quagga/types` only;
`form-2.ts` → `type QuestionnaireResponses` from `@quagga/types` only.
`@quagga/core` **never imports `@quagga/db`** — a stated architectural rule
(`docs/architecture.md:85-88`), which is what keeps 872 core tests DB-free.

**Runtime packages** used across the unit: `zod` (^4.4.3, same as Camp 404), `drizzle-orm` (^0.45.2,
same), `next` (navigation/cache/headers), `react` (`cache`, `useTransition`, `useFormStatus` from
`react-dom`), `lucide-react` icons, `node:crypto` `randomBytes`, `@vercel/blob` `put` (upload route only).
**No donor-only library is needed by anything in this unit** — no better-auth, no tiptap, no
libphonenumber, no Radix beyond what the shared `Select`/`Textarea`/`Input` already use. The one Radix
touch is `@quagga/ui`'s `Select` inside `field-kit.tsx:8-14`.

**Icons used** (all present in Camp 404's installed `lucide-react@1.16.0` per the mechanical-delta
finding): `AlertTriangle, Check, CheckCircle2, Circle, ClockAlert, Clock, Cloud, CloudOff, Copy, Crown,
ExternalLink, FileClock, Hourglass, Info, Loader2, Lock, MessageSquare, MessageSquareReply,
MessageSquareWarning, RotateCcw, Search, Send, TicketX, Trash2, UserPlus, XCircle`.

**`@quagga/ui` components consumed**: `Button`, `Badge`, `Card`/`CardContent`, `Input`, `Textarea`,
`Select*`, `Wizard`, `AckRow` (from `checkbox.tsx`), `FileUpload`, `StatusBadge`, `toast`.
Of these, `Wizard`, `AckRow`, `FileUpload` and `StatusBadge` have **no Camp 404 equivalent**.

---

## 10. AfrikaBurn / multi-tenant coupling — what must be collapsed

Ranked by how much rework each implies.

### A. `edition_id` — the deepest coupling, and it reaches into the gate engine

`editions` is "the root namespace for data" (`docs/synthesis.md:95`). In this unit specifically:

- `required_actions.edition_id` is **NOT NULL** and is part of the uniqueness key
  (`schema.ts:1450-1453`, `:1471-1474`).
- `ensureRequiredAction`, `completeRequiredAction` and `listRequiredActions` all take/resolve an
  `editionId` (`required-actions.ts:43`, `:79`, `:120`).
- `ensureCampUser` raises the bio action only `if (activeEdition)` (`session.ts:167-176`) — **no active
  edition means the gate never fires at all**.
- `registrations` is unique on `(group_id, edition_id)` (`schema.ts:1162-1165`).
- `getInvitePreview(token, editionId?)` resolves the Registered badge per edition
  (`invites-store.ts:129-167`).

Camp 404 has no `editions` table. **Collapse options:** drop the column entirely (simplest; loses
"confirm once per burn"), or replace it with a `camp_settings`-derived season/year scalar. Note that
Camp 404's `required_actions` uniqueness is currently `(user_id, action_key)`-shaped — the donor's own
comment (`required-actions.ts:32-42`) documents exactly the bug that shape causes if you ever want
per-season re-confirmation. That comment is worth reading even if the column is dropped.

### B. `group_id` — every camp-scoped row is keyed on it

`registrations.group_id`, `invites.group_id`, `memberships (user_id, group_id)`,
`memberships_group_ref_code_idx (group_id, ref_code)`, `getViewerRole(userId, groupId)`,
`groupIdForSlug(slug)`, the whole `/camps/[slug]/…` route shape. Camp 404 is one camp: **the group
collapses to the `camp_settings` singleton**, every `groupId` parameter disappears, `slug` disappears
from routes, and `memberships` becomes… Camp 404's `users.rank` + `team_memberships`.

Concretely for the invite flow: `redeemInvite(token, userId)` currently resolves
`getViewerRole(userId, invite.groupId)` to decide `isMember`; in Camp 404 "is a member" is
`hasCampAccess`/approval state, not a group membership row. `canRedeemInviteAs(invite, {isMember})`
survives unchanged — only the resolution of `isMember` changes. **That is the whole port** for the
core predicate.

### C. `membership_role` — six values, three of which are org ranks

`["god","org_staff","lead","admin","member","engineer"]` (`schema.ts:71-78`). `PROJECT_ADMIN_ROLES =
["lead","admin"]` gates every registration write (`registration/actions.ts:194`) and every invite mint
(`camps/[slug]/actions.ts:83`). Camp 404 has `rank = ["captain","member"]` with team-lead derived.
Mapping: `lead|admin → captain`, `member → member`, and `god|org_staff|engineer` **do not exist** —
they are the org tier. Every `inArray(memberships.role, ["god","org_staff"])` query
(`registration-store.ts:253`, `registration/actions.ts:374`) and `isOrgStaff` branch is dead weight in a
single-camp app; `canReplyToSectionReview({campRole, isOrgStaff})` collapses to "is an approved camp
member".

### D. The org-vs-participant review split

`decideRegistration` / `addSectionReview` / `setSectionReviewStatus` live in `apps/org` and are gated by
`requireOrgSession({ capability, domain: "registrations" })` (`org registrations.ts:120-123`, `:235-238`,
`:274-277`) — the `orgCanInDomain` data-driven permission layer. In Camp 404 the reviewer and the
reviewed are the same camp, so **the whole second permission system collapses to `requireClearance("captain")`**.
The *state machine* underneath (`REGISTRATION_TRANSITIONS`, `resolveReviewActionPath`, the TOCTOU guard,
the reason invariant) is entirely tenant-agnostic and ports unchanged.

### E. AfrikaBurn domain content baked into otherwise-generic modules

- `SECTION_KEYS` / `SECTION_LABELS` — LNT, Plug & Play, suppliers & commerce. AfrikaBurn's real form.
- `SOUND_SCALE` and `PLACEMENT_ZONES_2027` — Tankwa Town geography (binnekring, ish-roads, Loud Zone,
  Quiet Camping) and AB's sound guidance.
- `FORM_1_SECTION_KEYS` / `FORM_2_SECTION_KEYS` — AfrikaBurn's September/January split.
- `RESERVED_USERNAMES` includes `"afrikaburn"`, `"afrika_burn"`, `"quagga"`, `"quaggaportal"`, plus
  every route segment of the three donor apps (`username.ts:56-59`, `:76-119`).
- `"AfrikaBurn"` as the org author label (`registration-store.ts:193`).
- `withdrawConsequence` names AfrikaBurn and the edition year (`withdraw-registration.tsx:36-61`).
- `"Joining a camp is free — the platform never holds funds."` (`join/[token]/page.tsx:229`) and the
  ref-code EFT explainer (`member-ref-code.tsx:42-45`) encode AfrikaBurn's "the platform never processes
  money" law (`AGENTS.md:145-148`).
- Cookie name `"quagga.pending_invite"`.

None of these are structural — they are **data to swap**, not code to rewrite. The predicate tables are
`Record<SectionKey, …>`-shaped, so re-keying them is mechanical.

### F. Things that are FULLY tenant-agnostic (verified by reading imports)

`registration-state.ts` (except the `MembershipRole` type in one predicate), `entitlements.ts`,
`invite.ts`, `invite-view.ts`, `member-ref-code.ts`, `name-dedupe.ts`, `word-count.ts`,
`questionnaire-engine.ts`, `questionnaire-activation.ts`, `packages/ui/src/lib/wizard.ts`,
`packages/ui/src/components/wizard.tsx`, `AckRow`, `apps/web/lib/pending-invite.ts`,
`apps/web/components/join-button.tsx`, and the autosave engine inside `registration-wizard.tsx:164-256`.

---

## 11. Verbatim excerpts — the five most valuable pieces

### 11.1 The registration state machine (`packages/core/src/registration-state.ts:11-63`)

```ts
/** Legal next-states for each registration status. */
export const REGISTRATION_TRANSITIONS: Record<
  RegistrationStatus,
  readonly RegistrationStatus[]
> = {
  // Camp is drafting — can submit or abandon.
  draft: ["submitted", "withdrawn"],
  // Submitted — AB begins review, or the camp withdraws.
  submitted: ["under_review", "changes_requested", "withdrawn"],
  // Under review — AB decides, or asks for changes.
  under_review: ["approved", "rejected", "changes_requested"],
  // Changes requested — camp updates and resubmits, or withdraws.
  changes_requested: ["submitted", "withdrawn"],
  // Approved — the entitlement-granting state; only a voluntary withdrawal.
  approved: ["withdrawn"],
  // Terminal — AfrikaBurn's decision, not the camp's, so the camp cannot undo it.
  rejected: [],
  // WITHDRAWN IS NOT TERMINAL. A camp withdraws its own registration, and the
  // confirm dialog has always promised "it won't be considered for this edition
  // until you register again" — but there was no way back: `withdrawn` had no
  // legal transition, `registrations` is unique on (group_id, edition_id) so no
  // second row can be started, the wizard is read-only outside `draft` /
  // `changes_requested`, and the org console's `decideRegistration` throws for
  // every action out of `withdrawn`. A camp that clicked Withdraw was out for
  // the edition, permanently, on the strength of a sentence saying otherwise.
  //
  // Reopening returns it to `draft` — the camp's own state, editable, not yet
  // in front of a reviewer — which is exactly what "register again" means.
  withdrawn: ["draft"],
};

/** Whether `from → to` is a legal registration transition. */
export function canTransitionRegistration(
  from: RegistrationStatus,
  to: RegistrationStatus,
): boolean {
  return REGISTRATION_TRANSITIONS[from].includes(to);
}

/** Throw on an illegal registration transition; otherwise return `to`. */
export function assertRegistrationTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
): RegistrationStatus {
  if (!canTransitionRegistration(from, to)) {
    throw new Error(
      `Illegal registration transition: ${from} → ${to}. Allowed: ${
        REGISTRATION_TRANSITIONS[from].join(", ") || "(none — terminal state)"
      }`,
    );
  }
  return to;
}
```

### 11.2 The gate query — closed activations must release the gate (`apps/web/lib/required-actions.ts:109-167`)

```ts
export const listRequiredActions = cache(async function listRequiredActions(
  userId: string,
): Promise<RequiredActionLike[]> {
  // SCOPED TO THE ACTIVE EDITION (migration 0024). Resolved here rather than
  // threaded through the two dozen `pendingBlockingRoute` call sites: the
  // question every one of them asks is "is this person blocked RIGHT NOW",
  // which is always about the burn now running. `getActiveEdition` is
  // request-cache()d, so this costs nothing.
  const edition = await getActiveEdition();
  if (!edition) return [];
  const rows = await db()
    .select({
      actionKey: schema.requiredActions.actionKey,
      blocking: schema.requiredActions.blocking,
      status: schema.requiredActions.status,
      audience: schema.questionnaireActivations.audience,
      // CLOSING AN ACTIVATION MUST RELEASE ITS GATE. `closeActivation` flips
      // `questionnaire_activations.status` to "closed" and leaves the
      // `required_actions` rows `pending` — and this query never read that
      // column, so a closed questionnaire went on hard-gating every recipient
      // out of the whole app with no way back. "Close" is the ONLY undo for a
      // mis-sent blocking send; it has to mean it.
      activationStatus: schema.questionnaireActivations.status,
    })
    .from(schema.requiredActions)
    .leftJoin(
      schema.questionnaireActivations,
      eq(
        schema.questionnaireActivations.id,
        schema.requiredActions.activationId,
      ),
    )
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.editionId, edition.id),
      ),
    )
    .orderBy(asc(schema.requiredActions.createdAt));
  return rows
    .filter((r) => isParticipantFacingActivation(r.audience))
    .map(({ actionKey, blocking, status, activationStatus }) => ({
      actionKey,
      // A row whose activation is no longer open still EXISTS (it stays in the
      // inbox and in the audit trail) but it cannot block. `activationStatus`
      // is null for non-questionnaire actions like the Burner Bio, which have
      // no activation and must keep blocking.
      blocking:
        blocking && (activationStatus === null || activationStatus === "open"),
      status,
    }));
});
```

### 11.3 The invite landing resolver + the round-trip constants (`packages/core/src/invite-view.ts:78-160`)

```ts
export function resolveInviteView(
  invite: InviteLike | null,
  viewer: InviteViewer,
  now: Date = new Date(),
): InviteView {
  if (!invite) return NOT_FOUND;

  // Viewer-independent first: single-use beats expiry (./invite's rule).
  const live = canRedeemInvite(invite, now);
  if (!live.ok) {
    return {
      status: live.reason === "expired" ? "expired" : "already_used",
      cta: "none",
      showCamp: false,
      kind: invite.kind,
    };
  }

  if (!viewer.signedIn) {
    return { status: "valid", cta: "authenticate", showCamp: true, kind: invite.kind };
  }

  const asViewer = canRedeemInviteAs(
    invite,
    { isMember: viewer.isMember === true },
    now,
  );
  return {
    status: "valid",
    // `self_member` is the only rejection left once the invite is known live:
    // they are already in, so the action is "open the camp", never a second join.
    cta: asViewer.reason === "self_member" ? "open_camp" : "redeem",
    showCamp: true,
    kind: invite.kind,
  };
}

/**
 * WHY A COOKIE AND NOT A `?token=` / callbackURL: the token is a bearer
 * credential — whoever holds it joins the camp. Kept in an httpOnly, SameSite=Lax,
 * short-lived cookie it appears in NO url, so it cannot leak through a `Referer`
 * header to a third party, an address bar over someone's shoulder, browser
 * history, a copied "share this page" link, or an access/analytics log — and
 * httpOnly puts it out of reach of any injected script. SameSite=Lax is the
 * deliberate choice over Strict: the return leg is a top-level GET navigation
 * from Google's OAuth callback or an emailed verification link, which Strict
 * would drop. If the cookie is ever missing (a different browser finished the
 * verification), the failure is graceful, never a dead end: the person is signed
 * in and re-opening the SAME invite link from their email now works.
 */
export const PENDING_INVITE_COOKIE = "quagga.pending_invite";
export const PENDING_INVITE_MAX_AGE_SECONDS = 60 * 60;
export const INVITE_RESUME_PATH = "/join/continue";
export const INVITE_AUTH_PARAM = "next";
export const INVITE_AUTH_MARKER = "invite";

// `randomBytes(18).toString("base64url")` — 24 base64url chars. The bounds are
// generous so a future token length change does not silently reject live links.
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isWellFormedInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}
```

### 11.4 The atomic invite claim inside a transaction (`apps/web/lib/invites-store.ts:255-314`)

```ts
  // The claim + the membership change are ONE transaction: an invite whose
  // `used_at` is flipped must always yield the membership it granted, and a
  // failed membership write must roll the claim back so the link stays usable.
  return withTransaction(async (tx): Promise<RedeemResult> => {
    // Atomic claim — only one caller can flip used_at from NULL. If another
    // redeemer already won the race, no rows return and we abort with nothing
    // written (the transaction commits an empty change).
    const claimed = await tx
      .update(schema.invites)
      .set({ usedByUserId: userId, usedAt: new Date() })
      .where(
        and(eq(schema.invites.id, invite.id), isNull(schema.invites.usedAt)),
      )
      .returning({ id: schema.invites.id });
    if (!claimed[0]) {
      return { ok: false, error: inviteRejectionMessage("already_used") };
    }

    if (invite.kind === "lead_transfer") {
      // Demote existing leads to admin, then make the redeemer the lead.
      await tx
        .update(schema.memberships)
        .set({ role: "admin" })
        .where(
          and(
            eq(schema.memberships.groupId, invite.groupId),
            eq(schema.memberships.role, "lead"),
          ),
        );
      if (currentRole) {
        // Already a member (keeps their existing ref code) — just take the lead.
        await tx
          .update(schema.memberships)
          .set({ role: "lead" })
          .where(
            and(
              eq(schema.memberships.groupId, invite.groupId),
              eq(schema.memberships.userId, userId),
            ),
          );
      } else {
        await ensureMembershipWithRefCode(tx, {
          userId, groupId: invite.groupId, groupName: group.name, role: "lead",
        });
      }
    } else {
      await ensureMembershipWithRefCode(tx, {
        userId, groupId: invite.groupId, groupName: group.name, role: "member",
      });
    }

    return { ok: true, slug: group.slug };
  });
```

### 11.5 The joinable autosave flush (`apps/web/components/registration/registration-wizard.tsx:162-256`)

```ts
  /**
   * Flush the draft to the server. Resolves TRUE only once the server holds
   * every edit made so far.
   *
   * This used to return early when a save was already in flight, merely setting
   * a `pending` flag and firing an unawaited follow-up. `handleSubmit` awaited
   * it and took the resolution to mean "draft is saved" — so submitting while an
   * autosave was in flight validated the PREVIOUS draft. That is how the wizard
   * could show "6 of 6 sections complete" in the header and refuse with
   * "Complete all six sections" from the server in the same click.
   *
   * Now: concurrent callers JOIN the in-flight flush rather than skipping it,
   * and the flush loops until the draft is clean, so an edit made mid-write is
   * written by the next iteration instead of being dropped.
   */
  const saveNow = React.useCallback((): Promise<boolean> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (flushRef.current) return flushRef.current;
    if (!dirtyRef.current) return Promise.resolve(true);

    const run = (async (): Promise<boolean> => {
      while (dirtyRef.current) {
        // Clear BEFORE the await: an edit that lands during the write re-dirties
        // it and is caught by the next pass. Clearing after would swallow it.
        dirtyRef.current = false;
        setSaveState("saving");
        const result = await props.saveAction(props.slug, valuesRef.current);
        if (!result.ok) {
          dirtyRef.current = true; // stay dirty so a later flush retries
          setSaveState("error");
          toast.error("Couldn't save", { description: result.error });
          return false;
        }
        setSaveState("saved");
        setLastSavedAt(new Date());
      }
      // The loop only exits with `dirtyRef` clear, i.e. the server now holds
      // every edit on screen. That — not "a save happened once" — is what the
      // indicator is allowed to call saved.
      setDirty(false);
      return true;
    })();

    flushRef.current = run;
    void run.finally(() => {
      if (flushRef.current === run) flushRef.current = null;
    });
    return run;
  }, [props]);
```

### 11.6 (bonus) The TOCTOU compare-and-set + reason invariant (`apps/web/lib/registration-store.ts:615-655`)

```ts
  // TOCTOU guard — the same compare-and-set the org console's decide path uses.
  // `existing.status` was read a moment ago (and the camp's page may have been
  // open for an hour), and the transition above was validated against THAT
  // value, not against whatever the row holds now. Without re-checking the
  // status in the WHERE clause, a camp lead sitting on a stale page could
  // resubmit a registration AfrikaBurn had meanwhile REJECTED, or one already
  // withdrawn — both terminal states the state machine forbids — because the
  // check and the write were not the same instant. Guarding on the exact status
  // makes the losing writer update zero rows, and zero rows is reported back
  // rather than silently accepted as a success.
  const updated = await db()
    .update(schema.registrations)
    .set({
      status: target,
      updatedAt: new Date(),
      // THE REVIEWER'S WORDS BELONG TO THE STATE THEY WERE SAID ABOUT.
      // `decision_reason` holds the reason for the CURRENT state, and a camp
      // moving itself out of `changes_requested` has acted on that feedback —
      // carrying it into `submitted` left "From the reviewer: your LNT section
      // needs more detail" sitting under "Submitted — awaiting review", which
      // reads as though AfrikaBurn is still asking. Same for a withdrawal.
      decisionReason: null,
      ...(target === "submitted" ? { submittedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(schema.registrations.id, existing.id),
        eq(schema.registrations.status, existing.status),
      ),
    )
    .returning({ id: schema.registrations.id });
  if (updated.length === 0) {
    return {
      ok: false,
      error:
        "This registration changed since you opened it — reload and try again.",
    };
  }
```

---

## 12. Notable engineering practices worth stealing even where the code is not

1. **A transition table + `assert…Transition` that enumerates the legal moves in its own error message.**
   Trivially testable, and the error is actionable in a log.
2. **A property test over the transition table itself** — "never lists a self-transition and never targets
   an unknown status" (`registration-state.test.ts:84`). One test that can never go stale.
3. **TOCTOU compare-and-set as a house pattern**: validate against a read status, then guard the UPDATE's
   `WHERE` on that exact status, treat zero rows as a *reported* failure — and on the org side, throw
   inside the transaction so the audit row rolls back with it.
4. **"The reason belongs to the state it was said about"** — a data invariant asserted from three
   directions in `decision-reason-invariant.test.ts`, plus a migration (0027) that repaired the rows an
   earlier backfill wrote.
5. **Server recomputes derived state; the client is never trusted for completeness**
   (`registration-store.ts:456`) — and the client re-runs the *same pure predicate* for live progress
   (`registration-wizard.tsx:157-159`). One implementation, two call sites.
6. **Defence-in-depth at the write boundary**: the picker hides suspended suppliers, and
   `replaceSupplierDeclarations` re-filters through the same predicate because "a camp admin could POST a
   suspended supplier's id directly" (`registration-store.ts:536-543`).
7. **Zod failures that name the field**, backed by a label table, because an autosave retries the same
   rejected payload forever (`registration/actions.ts:94-119`).
8. **A pure "consequence copy" function shared by every control that fires the action**
   (`withdrawConsequence`) so the same action can never warn two different ways.
9. **Refused controls stay visible and disabled with the reason** — "a camp lead hunting for a missing
   button learns nothing from an absence" (`withdraw-registration.tsx:86-88`).
10. **Bearer credentials never enter a URL.** Cookie + opaque `?next=invite` marker; grammar-validated on
    both the URL segment and the cookie value.
11. **Confirm-before-write on any resume endpoint**, because a cookie binds to a browser, not an account.
12. **Every comment states the bug it prevents.** Nearly every block quoted above names a real incident.
    This is the single highest-value habit in the donor tree — and `docs/simplification-audit.md:44-50`
    also warns that eight donor comments *lie*, so: read the code under the comment.
13. **Request-scoped `cache()` on anything the gate touches**, with an explicit note that the cache lives
    and dies with the request so it "can never hand one account's row to another"
    (`session.ts:113-118`).
14. **Graceful degradation everywhere**: no Blob token ⇒ 501 + URL-paste fallback; no DB ⇒
    `<PreviewNotice feature="…" />`; no edition ⇒ empty gate rather than a crash.
