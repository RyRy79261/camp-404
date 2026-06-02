# Cross-cutting flows, the gating spine & the global state grammar

**Status:** Functional flows + state spec. The SPINE and the JOURNEYS — the cross-surface
glue. Per-surface local flows live in `design/spec/surfaces/*.md`; this file owns what
happens *between* surfaces and the canonical per-screen state grammar every surface implements.

**Source-grounded.** Reconciled to `design/spec/_analysis/decisions.md` (LOCKED) and the
gate-relevant briefs (`design/feature-set/02-auth-shells.md`, `03-invite-gate.md`,
`04-onboarding-wizard.md`, `05-pending-approval.md`, `23-auth-session-gating.md`;
`design/spec/surfaces/06-home.md`, `14-roster.md`, `11-invite-tool.md`, `13-family-tree.md`,
`21-voice.md`, `23-questionnaire-gate.md`, `24-questionnaire-runner.md`,
`27-questionnaire-complete.md`). Live spine = `apps/web/app/page.tsx:29-63` +
`apps/web/lib/required-actions.ts`.

**The four LOCKED decisions that bend these flows:**
- **D3 — preview-but-locked.** Captain/higher surfaces are *navigable*; chrome renders, **NO
  data** returns, all controls inert, `CaptainLock` "VIEW ONLY · no data for your rank". NOT a
  redirect, NOT a blocking overlay. → Captain surfaces are **not in the spine**; they soft-lock
  in place (see §1.4).
- **D4 — make-captain double opt-in.** New `captain_promotion_requests` table +
  `promotion_request_status` enum (`sent | accepted | declined | cancelled`). The TARGET accepts
  in their own app before rank flips. The ONLY schema change. (§2e specifies the accept surface.)
- **D5 — field-level voice only.** Dictation lives on `long_text` fields + the bug dialog via
  `DictatePill → RecorderPanel`. No home mic. (§2g.)
- **D2 — roster = responsive Iteration B**, unified on shared `CaptainLock`; S17 Captain mgmt
  (Iteration A) dropped. (§2c.)

---

## 1 — The gating spine

### 1.1 What the spine is

The spine is the **ordered, exit-bearing redirect chain** that every authenticated request
runs before any in-app surface renders. It is owned by the home route (`app/page.tsx:29-63`)
and **re-asserted defensively** by every gate page and every mutating server action (so direct
URL navigation can never sit on a stale gate, and a lost session mid-flow is caught).

Its contract (overview §7 invariant): **each gate either lets the user through, sends them to a
built route, or offers an escape; `nextGate` never routes to a gate with no page**
(`required-actions.ts:23-30`). There is no dead end without an exit.

### 1.2 The ordered chain (canonical)

Evaluate top-to-bottom. The **first** failing gate fires its redirect and stops; everything
below it never runs. Order is load-bearing — reordering changes which gate a partially-onboarded
user hits.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REQUEST /  (or any protected route)                                           │
│ export const dynamic = "force-dynamic"  — read the session cookie per request │
└─────────────────────────────────────────────────────────────────────────────┘
   │
   ▼
 G0  AUTHENTICATED?  getAuthenticatedUser()
   │   ├─ null  ──────────────────▶  HOME: render <LandingHero/>  (NOT a redirect)
   │   │                              every other protected page: redirect("/auth/sign-in")
   │   └─ user present ──┐           [exit: "Are you lost?" → /auth/sign-in]
   ▼                     │
 G0.5 ensureCampUser(user)  — load/create the camp row (god auto-create; else synthetic id:"")
   │
   ▼
 G1  HAS CAMP ACCESS?  hasCampAccess(campUser, email) = isGodEmail(email) || !!inviteCode
   │   ├─ false ─────────────────▶  redirect("/signup/required")        [INVITE-GATED]
   │   │                              gate page self-bounces back to / if access regained
   │   │                              [exit: redeem a code → /  |  "Sign out" → /auth/sign-out]
   │   └─ true ──┐
   ▼            │
 G2  PENDING BLOCKING OBLIGATIONS?  nextGate(getPendingRequiredActions(id))
   │   │   iterates oldest-first, SKIPS non-blocking, SKIPS any actionKey with no built route
   │   ├─ gate route returned ───▶  redirect(gate)   (today only burner_profile →
   │   │                              /onboarding/questionnaire)         [ONBOARDING-INCOMPLETE]
   │   │                              [exit: finish the questionnaire → /  |  page-0 "Sign out"]
   │   └─ null ──┐
   ▼            │
 G2b LEGACY FALLBACK (transitional, drop once seeding confirmed in prod; also the E2E gate):
   │   getBurnerProfile(id) → if (!profile?.completedAt) redirect("/onboarding/questionnaire")
   │
   ▼
 G3  APPROVED?  isApproved(campUser, email) = isGodEmail(email) || approvalStatus==="approved"
   │   ├─ false ─────────────────▶  redirect("/pending-approval")
   │   │                              page branches: pending (Clock) | rejected (ShieldX)
   │   │                              [PENDING-APPROVAL | REJECTED (terminal)]
   │   │                              [exit: captain decides (auto-clears) | "Sign out"]
   │   └─ true ──┐
   ▼            │
 ✅ PAST ALL GATES — derive viewerRank, render the app (Home control panel / requested surface)
       viewerRank = rank==="captain" ? "captain"
                  : isTeamLead(id)   ? "team_lead"
                  : "camp_member"
```

### 1.3 Per-gate exit table (the "every gate has an escape" invariant)

| Gate | Predicate (fail = held) | Held screen | Pass-through exit | Escape exit |
|---|---|---|---|---|
| **G0 Authenticated** | `getAuthenticatedUser()` null | Home: `LandingHero` inline · other pages: `/auth/sign-in` | sign in / up → `/` | (landing CTA "Are you lost?") |
| **G1 Invite** | `!hasCampAccess` | `/signup/required` (`AuthShell hideBack footer="Camp 404 is invite-only."`) | redeem valid code → `/` | "Sign out" → `/auth/sign-out` |
| **G2 Required-actions** | `nextGate(...)` non-null | the mapped gate (today `/onboarding/questionnaire` via S25→S26) | satisfy action → `/` | page-0/top-bar "Sign out" |
| **G2b Legacy onboarding** | `!completedAt` | `/onboarding/questionnaire` | complete → `/` | page-0 "Sign out" |
| **G3 Approval — pending** | `approvalStatus==="pending"` | `/pending-approval` (Clock, amber) | captain approves → auto-clears next load | "Sign out" |
| **G3 Approval — rejected** | `approvalStatus==="rejected"` | `/pending-approval` (ShieldX, destructive) — **terminal** | (only a captain re-deciding) | "Sign out" |

**Notes that keep the spine honest:**
- **God emails** (`GOD_EMAILS`) short-circuit BOTH G1 and G3 → never see invite or approval
  gates; auto-created `approved`, `member`, `inviteCode: null`. Still pass G2 (they get a
  seeded burner-profile action like everyone).
- **`nextGate` never strands.** A pending blocking action whose `actionKey` is unmapped (today
  `dietary_requirements`, `driver_profile`) is SKIPPED — it stays pending but does not gate,
  because there is no built page to send the user to.
- **Self-guarding gate pages.** `/signup/required` bounces home if access is (re)gained;
  `/pending-approval` re-runs G1→G2b→G3 (invite → approved → onboarding-complete) so it can
  never be the wrong screen. Direct navigation cannot park a user on a stale gate.
- **Defensive re-assertion in actions.** `submitInviteCode`, `saveBurnerProfile`, and every
  captain action re-check their precondition server-side; a session lost mid-flow redirects out.
- **Rejected is terminal for the member** — no in-app re-apply; copy says "reach out to whoever
  invited you." (Re-redeeming a vetting code *can* reopen `rejected → pending`; documented edge,
  not an offered path.)

### 1.4 Reconciling the spine with preview-but-locked (D3)

The five gating states split into two mechanisms — **do not conflate them**:

| Mechanism | States | Behaviour | Where it lives |
|---|---|---|---|
| **SPINE (redirect)** | invite-gated · onboarding-incomplete · pending-approval · rejected | Bounce to a dedicated gate page (or render Landing for signed-out). The user **cannot** see the app behind it. | `app/page.tsx` + self-guarding gate pages |
| **SOFT-LOCK (in-place, D3)** | captain-only-locked (a.k.a. preview-but-locked) | **No redirect.** The viewer navigates *into* the captain surface; chrome/structure render, server returns **zero rows / no data**, all controls inert, shared `CaptainLock` panel = "VIEW ONLY · no data for your rank". | each captain surface's own server gate |

**Captain surfaces are NOT gates in the spine.** `/captains/camp-management`, `/captains/tools`,
and the home Captain/Team-Lead rank groups do not redirect a low-rank viewer; they render
soft-locked **in place**. This replaces the live code's hard `redirect("/")` on `/captains/*`.

- **Why it's still a security boundary, not just dimming:** the *server* must withhold the data
  (roster rows, member PII, decrypted IDs, real badge counts). Preview-but-locked = render the
  shell, send nothing. A dimmed-but-populated render leaks data and is wrong.
- **Clearance rule:** a surface/group is unlocked iff `viewerRank ≥ requiredRank`
  (`captain` > `team_lead` (derived) > `camp_member`). A captain sees all; a team-lead sees
  member + lead unlocked, captain locked; a plain member sees only member unlocked.
- **The approval gate (G3) keys on `approval_status`, not rank.** A `captain`-ranked user who is
  still `pending`/`rejected` is held at `/pending-approval` like anyone — rank does not bypass
  approval.

---

## 2 — Key journeys

Legend: `▣` = surface/screen · `→` = navigation/redirect · `⟳` = server re-runs the spine ·
`✎` = mutation · `⎋` = escape hatch (sign-out).

### 2a — Brand-new member: land → sign-up → redeem → onboard → pending → home

The full cold-start path. Every gate is crossed exactly once, in order.

```
▣ Landing (/) — signed out, glitch 404
   └─ tap "Are you lost?" → /auth/sign-in
        │
▣ Auth — /auth/sign-up  (sign-up is OPEN; NO invite field here — by design)
   ├─ email + password + confirm  → signUp.email  → router.replace("/") ⟳
   └─ "Continue with Google"       → OAuth → returns via /auth (proxy verifier→cookie) → / ⟳
        │
   ⟳ spine: G0 ✓ authed → G1 ✗ no inviteCode
        │
        ▼
▣ Invite gate (/signup/required)  [G1, INVITE-GATED]
   "Camp 404 is invite-only — drop your code below."
   ├─ type code (slug, e.g. neon-toaster-mongoose) → ✎ submitInviteCode
   │     ├─ rate-limit (10 / 10min per user) → "Too many attempts…"   (stay)
   │     ├─ invalid/expired/revoked/exhausted/race-loser → "That invite code isn't valid." (stay)
   │     └─ OK → atomic consume → stamp users.inviteCode (+ rank if assigned,
   │            + approval=pending if requiresApproval) → seed burner_profile action → redirect("/") ⟳
   └─ ⎋ "Sign out" → /auth/sign-out
        │
   ⟳ spine: G1 ✓ → G2 nextGate = /onboarding/questionnaire
        │
        ▼
▣ Questionnaire gate (S25) — /onboarding/questionnaire  [G2, ONBOARDING-INCOMPLETE]
   "Before you go any further. A captain needs this; you can't use Camp 404 until it's done."
   QCard summary (title · question count · est. time) · lock notice "This can't be skipped."
   ├─ "Start questionnaire" → mount wizard at pageIndex 0
   └─ ⎋ "Sign out" (always visible on the interstitial)
        │
        ▼
▣ Onboarding wizard (S26 runner chrome / OB Step pages) — same route
   12 catalogue pages (11 question + 1 intro), "Step N of M", progress saves on every Next.
   per-page local validation (required + id-number⨯id-type cross-check);
   long_text fields expose DictatePill → voice (§2g).
   ├─ Next → validate → persistProgress save(final=false) → advance
   ├─ Back → i-1 (disabled at page 0, replaced by ⎋ "Sign out")
   └─ Finish (last) → ✎ save(final=true): validateResponses → split+encrypt id.number →
          upsert profile (markComplete) → satisfyBurnerProfileAction → redirect("/") ⟳
        │
   ⟳ spine: G2 ✓ (action satisfied) → G3 — invite was requiresApproval → approval=pending
        │
        ▼
▣ Pending-approval (/pending-approval)  [G3, PENDING-APPROVAL]
   Clock (amber) · "Application submitted" · "A captain needs to approve your access…"
   NO polling, NO app nav. "Just check back here" = reload.
   └─ ⎋ "Sign out"   (the ONLY interactive control)
        │
        ┊  ...captain approves elsewhere (§2c)...  (or rejects → ShieldX terminal screen)
        ▼
   ⟳ on next load: G3 ✓ isApproved → redirect("/")
        │
        ▼
▣ HOME control panel (/)  — rank-grouped tiles; viewerRank derived; EnablePush if `default`.
```

**Pre-approved variant:** if the redeemed code had `requiresApproval = false` (captain
pre-approved), G3 passes immediately — the member goes onboarding → **straight to home**, never
seeing `/pending-approval`.

### 2b — Returning member

A member who already cleared every gate. The spine is *idempotent* — it re-runs on every
request but every gate passes, so it's invisible.

```
▣ Landing (/) signed out  → "Are you lost?" → /auth/sign-in
   └─ email+password OR Google
        ├─ email sign-in honours ?callbackURL (sanitised; off-site → "/")
        └─ session restored → ⟳ spine
   ⟳  G0 ✓ → G1 ✓ (inviteCode on file) → G2 ✓ (no pending blocking actions) →
      G2b ✓ (completedAt set) → G3 ✓ (approved) → HOME
```
- **Already-authed shortcut:** an authed user hitting `/auth/sign-in` is auto-forwarded
  (`window.location.replace(callbackURL)`); hitting `/auth` (OAuth landing) is forwarded to `/`.
- **Mid-session new obligation:** if a captain has since activated a new blocking questionnaire
  for this member, G2's `nextGate` now returns that runner — the returning member is routed
  through S26 before reaching home (see §2f). Same spine, new pending row.
- **No invite re-burn:** a returning user with `inviteCode` already set short-circuits redemption
  `{ ok: true }` without consuming another use.

### 2c — Captain vetting a new applicant (roster → approve / reject)

The captain side of the pending-approval handshake. Surface = `/captains/camp-management`
(responsive Iteration B, D2). This is the **exit** for a §2a member stuck at G3.

```
▣ Home (captain) → tap "Camp Management" tile → /captains/camp-management
   server gate: authed? camp-active? approved? captain?
     ├─ NOT captain → render chrome + CaptainLock, rows=[]   (preview-but-locked, NO redirect)
     └─ captain →
▣ Roster (terminal desktop / mobile list)
   stats strip (Members / Approved / Incomplete) · search (name/handle/email/country) ·
   filter chips (All · Pending · Captains · Team: · Outstanding)
   ├─ chip "Pending" → rows where approvalStatus === "pending"  (the vetting queue)
   └─ tap a pending row → fetch detail (captain-gated; decrypt id.number) →
▣ MemberProfile (inline panel)
   overview + grouped questionnaire answers + government ID (behind captain gate; PII-flagged email)
   actions footer (shown ONLY while approvalStatus === "pending"):
   ├─ Approve  → ✎ decideApprovalAction(id,"approved")  → setUserApproval stamps
   │      approvalStatus + approvalDecidedBy + approvalDecidedAt → revalidate + optimistic flip
   │      → buttons clear, counts refresh.   ⇒ the applicant's NEXT load: G3 ✓ → in (§2a tail).
   └─ Reject  → RejectConfirm dialog
          ├─ "Reject" → ✎ decideApprovalAction(id,"rejected")  (TERMINAL/denied)
          │      ⇒ applicant's next load: G3 fail → /pending-approval renders ShieldX "not approved".
          └─ "Keep pending" → dismiss, no change
   self-guard: a captain cannot approve/reject/promote their OWN account.
```
- **No realtime.** The applicant is not pushed; their gate clears on their next page load
  (`isApproved` short-circuits to `/`). The pending screen explicitly does not poll.
- **Decision domain is `approved | rejected` only** — a captain can never set `pending` (that is
  a signup-time state).

### 2d — Invite lifecycle: mint → share → redeem → family-tree edge

One code from creation to the lineage edge it draws. Spans `/tools/invite` (mint, §2c-adjacent),
`/signup/required` (redeem, §2a), and `/family-tree` (the edge).

```
MINT  ▣ /tools/invite  (any approved, camp-active member; rank branches the form)
   member variant : single-use, requiresApproval=true, email required, CaptainOptions hidden
   captain variant: + Pre-approve checkbox (requiresApproval=!preApprove)
                     + multi-use stepper (maxUses 1–100)
   slug auto-generated (JetBrains Mono) + live availability hint (idle/checking/available/taken/invalid)
   └─ "Create invite" → ✎ createInviteCode INSERT:
         code(slug) · created_by_user_id = minter ·  ← THE FAMILY-TREE EDGE ORIGIN
         note · max_uses · requires_approval · invited_email · assigned_rank = NULL (always; CLI-only)
      → SuccessCard (Copy / Send another)
        │
SHARE   the slug, out-of-band (the email field only records the intended recipient; no auto-send modelled)
        │
REDEEM  ▣ /signup/required  (the new person, after sign-up — §2a, G1)
   ✎ consumeInviteCode (atomic use_count++ guarded by revoked/expiry/max-uses; race-loser → invalid)
   → stamps redeemer.users.invite_code = slug
   → requiresApproval ? approval=pending (→ §2c vetting) : approved (straight through)
        │
EDGE    ▣ /family-tree  (read-only, NOT rank-gated; any approved member)
   getReferralRoster: users LEFT JOIN invite_codes ON code = users.invite_code
   parent(node) = invite_codes.created_by_user_id of the redeemed code
   ⇒ minter → redeemer becomes a parent→child branch; "via <slug>" mono line on the child.
   roots = NULL invite_code (god/founder) | NULL created_by | left-join miss.
```
- **Rank boundary held twice:** the mint surface always writes `assigned_rank = NULL` (captain
  codes are CLI-only) and the server recomputes `isCaptain` from the DB row — a crafted POST
  cannot self-promote.
- **Multi-use code** draws **multiple** child edges from one minter (one per redemption), each a
  separate redeemer node sharing the same `via <slug>` line.

### 2e — Make-captain double opt-in handshake (D4) — **where the TARGET accepts**

The two-sided promotion. The requesting captain acts on `/captains/camp-management`; **the
TARGET accepts on their own HOME surface, in the Captain rank-group header** (the rank section
they are about to gain). Rationale: it's the surface that *changes* on acceptance, it is always
visited, and it needs no new route. A mirror entry in `/notifications` drives discovery.

> **Resolves roster Open Question #3** ("where does the target accept?"). **Decision (flows
> lead): TARGET accepts on Home, in a pending-promotion banner pinned above the Captain
> rank-group; a `notification_deliveries` row links to it for discovery.** No new route.

```
REQUEST (captain, on /captains/camp-management → MemberProfile of a non-captain, non-self target)
   ├─ "Assign captain rank" → AssignCaptainDialog (two-step tracker)
   │     "Make {Name} a captain? …they must accept in their own app — two-sided agreement."
   │     step 1 "You send the request"  · step 2 "They accept in their app"
   │     └─ "Send request" → ✎ INSERT captain_promotion_requests
   │            { target_user_id, requested_by_user_id, status:'sent', created_at }
   │            (idempotent: reuse the open 'sent' row for the same target; no duplicates)
   │            → step 1 → "Done", step 2 → "Pending"; rank UNCHANGED.
   └─ later: captain may "Cancel" an in-flight request → status='cancelled'.
        │
        ┊  side-effect: enqueue a notification_deliveries row for the target ("You've been
        ┊  nominated for captain — review on Home")  [discovery channel]
        ▼
ACCEPT  ▣ TARGET's HOME (/)  — a PendingPromotionBanner renders above the (still-locked) Captain group
   "{Captain} wants to make you a captain."   [Accept] [Decline]
   ├─ Accept  → ✎ status='accepted', decided_at=now → app logic flips users.rank = 'captain'
   │      → ⟳ next render: viewerRank='captain' → the Captain rank-group UNLOCKS (no longer
   │        preview-but-locked); captain surfaces return data.   (Approval gate G3 unaffected —
   │        if the target were somehow unapproved they'd still be held at /pending-approval.)
   └─ Decline → ✎ status='declined', decided_at=now → no rank change; banner dismissed.
```
- **Non-bypassable:** sending NEVER flips rank; only the target's `accept` (app logic on the
  `accepted` transition) writes `users.rank = 'captain'`. `setUserRank` alone can't model the
  handshake — that's why the table exists (the only schema change, D4).
- **Coexists with code-minted captains:** invite codes can still mint `assigned_rank='captain'`
  (CLI-only); that path bypasses the handshake intentionally. The in-app promotion path is *this*
  flow only.
- **Request lifecycle states** (`promotion_request_status`): `sent` (awaiting) → `accepted`
  (rank flips) | `declined` | `cancelled`. The roster dialog's step tracker reflects the live
  state when reopened.

### 2f — Post-onboarding required-questionnaire queue (S25 → S26 → S27 sequential unlock)

The multi-questionnaire trio (Safety → Dietary → Agreements). Expressed entirely over the
existing `required_actions` engine — **no schema change** (D-carry; scope expansion to confirm).
Sequential unlock = app logic over G2.

```
SETUP  captain opens questionnaire_activations (blocking=true, scope=everyone) → openActivation
       fans out one required_actions row per member (type='questionnaire', blocking, status='pending').
       members now have N pending blocking obligations, oldest-first = gate order.
        │
   ⟳ spine G2: nextGate returns the FIRST pending blocking action that maps to a built route.
        │
LOOP   ▣ S25 gate (per questionnaire)  →  "Start"  →
       ▣ S26 runner (BlockingTopBar · BlockingNotice "can't use the app until finished" ·
                     one CurrentQuestionCard per step · Required chip)
          └─ Submit (last) → ✎ satisfyRequiredAction (version-aware) → redirect("/")
        │
   ⟳ spine re-evaluates:
       ├─ another pending blocking action remains → G2 routes to the NEXT runner
       │     (optionally via ▣ S27 "More required" — see below)
       └─ none remain → falls through to G3/HOME
        │
        ▼
▣ S27 complete & queue  (the visible bridge between items)
   Section A hero — TWO variants:
     • "All done" → "Back to camp" → /  (⟳ → home, or G3 if still pending approval)
     • "More required" → "N more required before you're unlocked" → "Start next questionnaire" → next S25
   Section B queue — one card per required questionnaire in submission order:
     complete (check, $accent) · next-up (actionable) · locked (op 0.55, inert)
   ⎋ "Sign out" always visible (wrong-account escape)
```
- **Unlock semantics:** the queue marks the first `pending` row **next-up** and subsequent
  `pending` rows **locked** (op 0.55). The lock is a *derived/app* state, not a new enum member —
  `required_action_status` stays `pending | completed | waived | expired`.
- **`expired`** rows: distinct "Expired — contact a captain" card; not counted toward the
  blocking total, never "next-up". **`waived`** counts as done. **non-blocking** rows show for
  visibility but never gate / never count.
- **Burner profile vs trio:** the burner-profile wizard (§2a) redirects to `/` on completion,
  NOT to S27. S27 owns the *subsequent* captain-activated trio. (Open: whether burner-profile
  final-submit should also land on S27 for a continuous "here's what's next" moment — raise with
  product; not assumed here.)
- **Today's reality:** `ACTION_ROUTES` maps only `burner_profile`. Dietary/Agreements stay
  `pending` but cannot gate until their bespoke runner routes exist — `nextGate` skips them,
  spine never strands. The runner chrome is the shared template for all of them.

### 2g — Voice dictation on a long_text field (D5)

Field-level only. No home mic, no TALK centre. Entry = `DictatePill` on any `long_text`
question (onboarding, the runner, My-forms replay) and the bug dialog.

```
▣ long_text field (e.g. OB bio / ideas; runner long_text; bug dialog)
   below the Textarea: [⊙ "Dictate instead"]  (DictatePill)
   └─ tap → DictatePill unmounts → RecorderPanel mounts inline (NOT a modal)
        │
   RecorderPanel state machine (idle → requesting → recording → processing → review):
   ▸ idle        "Tap to record" · mic ring
   │   └─ tap record → requesting (mic permission prompt)
   ▸ requesting  ├─ denied  → error ("Microphone permission denied") → "Try again" → reset → idle
   │             └─ granted → recording
   ▸ recording   live waveform · mm:ss timer · auto-stop at 2 min
   │   └─ "Stop & transcribe" → processing
   ▸ processing  POST /api/voice/transcribe (Groq Whisper) — audio NEVER persisted
   │   ├─ empty/silent clip (size 0)  → idle silently (no append)
   │   ├─ error / 429 rate-limit      → error (server message) → record again resets
   │   └─ success (non-empty text)    → transcript-review            ◀ NEW step (board-canonical)
   ▸ review (TranscriptResult)  editable transcript preview
       ├─ "Use this text" → onTranscript(edited) → APPEND to host field (never replace;
       │     newline-joined; clamped to question.maxLength) → idle
       └─ "Re-record" → discard → idle
   ⎋ X "Close dictation" (disabled while recording/busy) → RecorderPanel unmounts → DictatePill returns
```
- **Append, never overwrite** — typing + dictation mix in the same field; transcript appended,
  sliced to `maxLength`.
- **Auth at the route checks truthiness only** (no rank/approval check on `/api/voice/transcribe`)
  — gating is upstream at the already-gated host surface. Voice has NO rank awareness and no
  preview-but-locked variant.
- **Review step is the one divergence from live code** (live fired `onTranscript` immediately);
  board wins, build the review step.

---

## 3 — Global state matrix (canonical per-screen grammar)

Every surface expresses the **always-needed** rows plus the Camp-404 **gating** rows it's in
scope for. There are **no sync rows** (server-only) and **no budget/over-target rows** (no
goals). Reconciled to decisions: preview-but-locked replaces hard-redirect for captain surfaces;
voice review step added; roster soft-locks.

### 3.1 The grammar (one table)

| State | Meaning | Required grammar |
|---|---|---|
| **Empty** | No rows for this surface yet | Calm empty copy + the primary next action; never a dead blank. (`role` lists, inbox, roster, queue, tree) |
| **Loading** | RSC/fetch in flight | Server pages arrive complete (no client skeleton needed); client fetches use shape-matched skeletons or a quiet `Loader2` spinner, never a flash. |
| **Populated** | Data present | Normal content render. |
| **Validation-error** | Field / cross-field rule failed pre-submit | Inline message under the field (`role="alert"`) + required `*`; page-level `_form`/`_root` banner; runner adds in-card `InlineAlert`. |
| **Submitting / pending** | Mutation in flight | Disable the submit control + in-button spinner (`isPending`); inputs stay readable. Label flips ("Checking…", "Creating…", "Submitting…"). |
| **Success** | Mutation succeeded | Server redirect (gates), inline check/toast/SuccessCard, ack-gate advance, or optimistic flip + `revalidate`. |
| **Disabled** | Control not actionable now | Greyed + non-interactive; explain *why* where non-obvious (not the same as preview-but-locked). |
| **Invite-gated** | Authed, no invite, not god | **SPINE redirect** → `/signup/required` ("invite-only — drop your code"). |
| **Onboarding-incomplete** | Pending blocking required_action with a built route | **SPINE redirect** → that gate (today `/onboarding/questionnaire`); wizard offers page-0 sign-out. |
| **Pending-approval** | Vetting-required code redeemed; `approval=pending` | **SPINE redirect** → `/pending-approval` (Clock); auto-clears on captain approve. |
| **Rejected** | `approval=rejected` (terminal) | **SPINE redirect** → `/pending-approval` (ShieldX); no path back in. |
| **Captain-only-locked (preview-but-locked, D3)** | viewerRank < surface/group requiredRank | **SOFT-LOCK in place** — chrome renders, server returns **NO data**, controls inert, `CaptainLock` "VIEW ONLY · no data for your rank". NOT a redirect. |
| **Promotion-pending (D4)** | Open `captain_promotion_requests.status='sent'` targeting viewer | PendingPromotionBanner on Home above the Captain group: Accept / Decline. (Surface-specific, not universal.) |

### 3.2 Which surfaces implement which states

Rows: surfaces. Cols: the global states. `●` must implement · `○` applies via spine
redirect *to* it (it's the held screen) · `L` preview-but-locked applies · `–` N/A.
"Always-needed" = Empty/Loading/Populated/Validation/Submitting/Success/Disabled folded where
relevant.

| Surface (route) | Empty | Load | Pop | Valid | Submit | Succ | Disab | Invite | Onboard | Pending | Reject | **Locked (D3)** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Landing `/` (unauth) | – | – | ● | – | – | – | – | – | – | – | – | – |
| Auth shells `/auth/*` | – | ● | ● | ● | ● | ● | ● | – | – | – | – | – |
| **Invite gate** `/signup/required` | – | – | ● | ● | ● | ○→/ | ● | **○ held** | – | – | – | – |
| **Questionnaire gate** S25 | – | ● | ● | – | – | ○ | – | (up) | **○ held** | (up) | (up) | – |
| **Onboarding wizard / runner** S26 | ● | ● | ● | ● | ● | ○→/ | ● | re-check | **○ held** | – | – | – |
| **Questionnaire complete** S27 | ● | ● | ● | – | – | ● | ● | defence | guard | →G3 | →G3 | – |
| **Pending-approval** `/pending-approval` | – | ● | ● | – | – | ○→/ | – | self→ | self→ | **○ pending** | **○ rejected** | – |
| **Home** `/` (authed) | ● | ● | ● | – | – | ● | ● | ○→ | ○→ | ○→ | ○→ | **L** (Captain/Lead groups) |
| Profile `/profile` · edit | ● | ● | ● | ● | ● | ● | ● | ○→ | ○→ | ○→ | ○→ | – |
| Notifications `/notifications` | ● | ● | ● | – | ● | ● | ● | ○→ | ○→ | ○→ | ○→ | – |
| Tools hub `/tools` | – | ● | ● | – | – | – | ● | ○→ | ○→ | ○→ | ○→ | – |
| **Invite tool** `/tools/invite` | ● | ● | ● | ● | ● | ● | ● | ○→ | (skips) | ○→ | ○→ | – (in-form rank branch, not CaptainLock) |
| My forms `/tools/forms[/key]` | ● | ● | ● | ● | ● | ● | ● | ○→ | ○→ | ○→ | ○→ | – |
| Family tree `/family-tree` | ● | ● | ● | – | – | – | ● | ○→ | ○→ | ○→ | ○→ | – (NOT rank-gated) |
| **Roster** `/captains/camp-management` | ● | ● | ● | ● | ● | ● | ● | ○→ | (up) | ○→ | ○→ | **L** (whole surface) |
| **Captain announcements** `/captains/announcements` | ● | ● | ● | ● | ● | ● | ● | ○→ | (up) | ○→ | ○→ | **L** |
| **Captain tools** `/captains/tools` | – | ● | ● | – | – | – | ● | ○→ | (up) | ○→ | ○→ | **L** |
| MCP connect `/mcp/connect` | – | ● | ● | – | ● | ● | ● | ○→ | ○→ | ○→ | ○→ | – (own 403 consent gate) |
| Voice RecorderPanel (embedded) | ● | ● | ● | ●(clamp) | ● | ● | ● | – | – | – | – | – (no rank awareness) |

**Reading the matrix:**
- `○→` on app surfaces = the spine redirects *out* of them when that gate fails; they never
  render their own version of that gating state — the dedicated gate page does. They only ever
  render once **past** all spine gates.
- `○ held` = this IS the screen the spine redirects *to* for that state (the gate page itself).
- **`L` (preview-but-locked)** is implemented by exactly the captain/rank surfaces: **Roster,
  Captain tools, Captain announcements (whole-surface)** and **Home (per-group, Captain +
  Team-Lead groups)**. These are the only surfaces that render the captain-only-locked state in
  place; everything else either redirects (spine) or has no rank gate.
- **Family tree** and **Invite tool** are explicitly **not** `CaptainLock` surfaces: family tree
  is not rank-gated at all; the invite tool serves both ranks and branches *in-form*
  (CaptainOptions vs MemberNote), not via a lock.
- **Voice** expresses none of the gating states — it has no rank awareness and is only reachable
  from already-gated hosts.
- **Promotion-pending (D4)** is surface-specific (Home banner) and omitted from the universal
  matrix; see §2e.

### 3.3 Invariants the matrix must satisfy

1. **Exactly one gate page per spine state** — invite-gated→`/signup/required`,
   onboarding→`/onboarding/questionnaire`, pending+rejected→`/pending-approval`. No app surface
   re-implements these; they redirect.
2. **Preview-but-locked withholds data server-side** — `L` cells render shell + `CaptainLock`,
   server sends zero rows. Dimming a populated render is a data leak and is non-conformant.
3. **Every gate/blocking surface carries a sign-out escape** — invite gate, all questionnaire
   surfaces (S25/S26/S27), pending-approval. No dead end.
4. **Redundant-channel rule holds across all states** — colour never the sole carrier; keep
   icon + label (Clock/ShieldX, status pills, role badges, lock icon). Rank is never recoloured
   to encode approval.
5. **Server is truth** — no Empty/Loading optimistic local cache to reconcile; what renders is
   what the DB says (except the explicit optimistic approval-flip + `revalidate` on the roster,
   and client-only Home customise-layout persistence per D4's no-new-table constraint).
