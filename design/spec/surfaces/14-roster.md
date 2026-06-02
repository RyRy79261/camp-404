# Captain roster & member detail — functional brief

- **Route(s):** `/captains/camp-management`
- **Canonical board(s):**
  - Desktop — `S17 Roster — Iteration B (terminal console)` (board #37, 1040px; `design/.spec-extract/boards/37-s17-roster-iteration-b-terminal-console.txt`)
  - Mobile — `S17 Roster — Iteration B (mobile)` (board #38, 430px; `design/.spec-extract/boards/38-s17-roster-iteration-b-mobile.txt`)
- **Superseded / dropped:**
  - `S17 Captain mgmt` (board #26, Iteration A — plain Inter wide table) — **DROPPED** per locked decision #2 (user deleted it in Pencil; on-disk `app.pen` still contains it; treat as removed).
  - The terminal board's **bespoke** read-only panel (`MemberReadOnly` / `RedactedID` / `LockedActions`, lines 313–331) — **DROPPED**; both breakpoints unify on the shared `CaptainLock` (locked decision #2).
- **Breakpoints:** responsive single route. `< sm` → mobile board (430px). `≥ sm` (target ~1040px container) → terminal-console board. Live code currently uses `max-w-5xl` for the wide table (this is the wide-table surface, not the global `max-w-lg`).

---

## Purpose

The captain-only "who is on camp and where are they up to" command surface, styled as a JetBrains-Mono data console (deliberate brand data-face, decision #2). It lists one row per real (non-system, non-sanitised) camp member with rank, sign-up status, handle, home country and outstanding-action signals; it is searchable (name / handle / email) and filterable by status / cohort / team. Opening a member reveals an inline profile (overview + questionnaire answers + government ID behind the captain gate), from which a captain can **approve** or **reject** a pending applicant and — captain to captain — **assign captain rank** via a **two-sided double opt-in** (the only schema change in the redesign, decision #4).

Access follows **preview-but-locked** gating (decision #3): a non-captain can navigate in and sees the surface's chrome/structure, but the server returns **zero rows**, all controls are inert, and a shared `CaptainLock` panel renders "VIEW ONLY · no data for your rank". This replaces the current code's hard redirect on `/captains/*`.

---

## Layout & modules (decomposition)

Top-to-bottom, both breakpoints share the same module order. The terminal board adds console chrome (`> ` prompts, `//` section dividers, caret/cursor rects, `TermBar` "42 records"); the mobile board is the same information at 430px.

### 1. Header / console bar
- Back affordance: `chevron-left` + "Camp tools" (`$muted-foreground`) → links back to the captain tools hub / `/`. (Live code labels it "Captains".)
- **Terminal only:** `TermBar` strip — "camp404 · roster" + live record count "42 records" (`$accent`); `TitleRow` "> Camp management" with a blinking caret rect.
- **Mobile:** H1 "Camp management" (Inter 25/700).
- Lede paragraph (terminal): "The full roster. Open a member to read their profile, approve or reject pending sign-ups, and — captain to captain — assign captain rank."

### 2. Stats strip
Three count cards: **MEMBERS** (all sign-ups, terminal "42"), **APPROVED** (cleared to camp, terminal "39", green `#3fd07a`), **INCOMPLETE** (notices & questionnaires unfinished, "7", `$primary`). Terminal cards carry a sublabel line; mobile cards are compact (`$accent` numerals). Counts are derived from the roster (see Data). The mobile "INCOMPLETE" reuses `$accent` for the numeral — reconcile to the terminal's `$primary`/warning intent (token drift, decision #2 carry).

### 3. Toolbar (search + multi-chip filters)
- **Search** field, console-styled (`> ` prompt + blinking cursor rect): placeholder "Search by name, handle or email". Filters client-side over display name, handle (@), email, country and humanized team names (live: name / team / country; **add handle + email** per board placeholder).
- **Filter chips** (multi, horizontal): `All 42` (active, `$accent` outline + dot), `Pending 3` (count), `Captains 4` (count), `Team: All` (dropdown — `chevron-down`, opens a team picker over `teamEnum`), `Outstanding 7` (amber `#e0a800` + `triangle-alert`). Active chip = accent fill+stroke; inactive = `$muted`/`$border`.
  - Map: `Pending` = `approvalStatus === "pending"` (the live "Awaiting approval" filter, relabelled). `Captains` = `rank === "captain"`. `Outstanding` = `pendingRequiredActions > 0` (or status `pending`/incomplete). `Team:` = membership in selected `teamEnum`.

### 4. Roster rows
- **Terminal:** a `Table` with `HeaderRow` (MEMBER · HANDLE · COUNTRY · ROLE · [view]) and one row per member. Each row: left **status bar** (4px, colour by status — `$accent`=onboarding/active, `#3fd07a`=approved/ready, `$destructive`=rejected/blocked), avatar (mono initials on a per-member tint), display name, `@handle`, country (flag + name), ROLE (emoji + label: 🐱 Member, 🦩 Captain, 🪄 Lead), and a `chevron-right` open affordance. Selected row gets an accent wash (`#00dcff14`), others alternate `#ffffff07` / transparent.
- **Mobile:** stacked 58px rows — status bar, avatar, name + sub-line (`@handle · flag · country`), trailing role emoji. Selected row name turns `$accent`.
- **Role/rank** is presentation only: ranks stored = `captain | member`; **Lead** (🪄) and Captain (🦩) are derived (decision: lead from `team_memberships.is_lead`, captain from `rank`). The roster row distinguishes all three; the inline profile's rank tag distinguishes Captain vs Member only (live asymmetry — flag).

### 5. Inline member profile (`MemberProfile`)
Opens when a row is tapped (the "// Open member profile" section on the terminal board; an inline expanding panel, not a separate route). Sub-regions:
- **PanelBar:** "> nova reyes · profile" + record index "#01".
- **ProfileHead:** large avatar, display name, `@handle`, **team badges** (one chip per `team_memberships.team`, dot-coloured), and a **status tag** (Pending/amber, Approved, Rejected) + **rank tag** (emoji + Member/Captain).
- **Bio paragraph** (`bio.statement`).
- **Fields grid** (label = JetBrains-Mono 11/600 caption; value = 14):
  - Country (flag + name), **Email** (plaintext — PII flag), Dietary needs (or "Not provided yet — we'll show it here once {name} adds it"), Emergency contact ("Listed ✓" / not listed), Arrival date, **ID / Passport** (`🇿🇦 ZA · A0148822` — decrypted behind the captain gate), Outstanding ("{n} to complete"), and "What do you bring to camp?" (`ideas.this_year`).
  - These map to questionnaire answers + decrypted `id.number`; render the full questionnaire-grouped profile (live `presentMemberDetail` groups answered questions by page). The board shows a curated subset; the spec keeps the full grouped profile and treats the board fields as the priority overview.
- **Divider + Actions footer:**
  - `Approve` (`Button-Primary`) + `Reject` (`Button-Outline`) — shown **only while** `approvalStatus === "pending"`.
  - **Assign captain rank** — a `$secondary`-tinted action (`shield` icon) opening the double-opt-in dialog. Shown only when the viewer is a captain and the target is not already a captain (and not self).
  - (Live "Ping" placeholder, permanently disabled, "Coming soon" — boards omit it; carry as a disabled future affordance, see Open questions.)

### 6. Assign-captain double opt-in dialog (NEW flow)
Terminal `DialogScrim`/`Dialog` (440px, `$secondary` stroke) — mobile inline `AssignCaptainModal`. Window-chrome title bar (`shield-plus` "Assign captain" + red `x` close). Body:
- Heading "Make {Name} a captain?"
- Copy: "Captain is the highest rank in camp. They must accept the request in their own app before it takes effect — this is a two-sided agreement, so you can't assign it for them."
- **Steps** (the two-sided contract, terminal shows live state, mobile shows numbered 1/2):
  1. "You send the request" — `circle-check` / "Done" once sent.
  2. "They accept in their app" — `circle` / "Pending" until accepted.
- Actions: `Cancel` (`Button-Outline`) + `Send request` (`Button-Primary`).
- On send → create a `captain_promotion_requests` row (`status = sent`); rank does **not** change until the target accepts in their own app. Subsequent opens of this dialog for a member with an in-flight request reflect the live step state (sent → accepted/declined/cancelled).

### 7. Reject confirm dialog
Terminal `RejectScrim`/`RejectConfirm` (440px, `$destructive` stroke) — mobile `RejectModal`. Title bar `triangle-alert` "Reject application". Body: "Reject {Name}'s application?" + "They'll be told the application wasn't approved. This can't be undone here." Actions: `Keep pending` (`Button-Outline`) + `Reject` (`Button-Primary`, `$destructive` fill).

### 8. Locked (non-captain) state — shared `CaptainLock`
The "// Non-captain view (locked)" region. **Both breakpoints render the shared `CaptainLock`** (component #09), terminal-skinned, with overrides "Captains only" / "Camp management is visible to captains. Your rank doesn't include it." Per decision #2 the terminal board must **not** roll its own `MemberReadOnly` panel — that bespoke read-only panel (and its `RedactedID` + `LockedActions`) is dropped in favour of `CaptainLock`. Per decision #3 this is **preview-but-locked**: structure/chrome renders, the table/stats receive no data (empty or skeleton), all controls are inert, and the dialogs/profile are not mounted. Treatment copy = "VIEW ONLY · no data for your rank" consistent with the home rank-section preview.

---

## Components used (reusable + new)

| Component | Role | Key props / variants |
|---|---|---|
| `CaptainLock` (reusable #09) | Preview-but-locked panel for non-captains; unifies both breakpoints | text overrides (title + body); terminal skin variant; "VIEW ONLY · no data for your rank" |
| `Button-Primary` (reusable #04) | Approve / Send request / Reject(destructive) | label override; `w:fill_container`; destructive fill on Reject-confirm |
| `Button-Outline` (reusable #05) | Reject / Cancel / Keep pending | label override; `w:fill_container` |
| `StatsStrip` (new) | 3 count cards (Members / Approved / Incomplete) | counts; responsive (terminal sublabels vs compact mobile) |
| `RosterToolbar` (new) | Search + multi-chip filter row | search query; active filters; chip counts; team dropdown over `teamEnum` |
| `FilterChip` (new) | One filter chip (count / dropdown / warning variants) | label, count, active, tone (accent / warning / neutral), variant (toggle / dropdown) |
| `RosterTable` / `RosterList` (new) | Terminal table vs mobile list of rows | rows; selectedId; locked; onSelect |
| `RosterRow` (new) | One member row (responsive) | member, status bar colour, role badge, selected |
| `StatusBar` / `StatusPill` (new) | Status colour bar + pill | status → colour (ready/onboarding/awaiting/rejected/pending) |
| `RoleBadge` (new) | Emoji + label (🐱 Member / 🦩 Captain / 🪄 Lead) | rank, isLead |
| `Avatar` (new/shared) | Mono initials on per-member tint, or `profile.image` photo | initials, tint, imageUrl |
| `MemberProfile` (new) | Inline profile panel (head + bio + fields grid + actions) | member detail; isCaptain; onApprove/onReject/onAssign |
| `ProfileFieldGrid` / `DetailList` (new) | Label/value caption grid (console captions) | items[]; empty → "Nothing recorded." |
| `TeamBadge` (new) | Team membership chip (dot + label) | team, colour |
| `AssignCaptainDialog` (new) | Two-sided opt-in modal with step tracker | target; request state (sent/accepted/declined/cancelled); onSend/onCancel |
| `OptInStepTracker` (new) | The two-step "you send → they accept" indicator | step states |
| `RejectConfirmDialog` (new) | Reject confirmation modal | target; onReject/onKeepPending |
| `DialogScrim` / window-chrome title bar (new) | Console-skinned modal frame (`x` close) | tone (secondary / destructive) |

`Button-Primary`/`Button-Outline`/`CaptainLock` are existing reusables; everything else is **new** (board-implied, not among the 10 canvas reusables nor existing `@camp404/ui`). Reuse `@camp404/ui` primitives (`Dialog`, `Input`, `Button`) underneath where they exist.

---

## States

Global-state matrix applied to this surface:

- **Empty:** no members → "No members have signed up yet."; filtered-to-zero → "No members match your search." / "Nobody is awaiting approval." (per active filter); profile with no answers → "No questionnaire answers on record yet." / `DetailList` empty → "Nothing recorded."
- **Loading:** inline member-profile fetch → spinner; header/panel description shows "Loading…". (Stale fetches are discarded on rapid row switches.)
- **Populated:** rows + stats rendered; profile loaded with overview + grouped sections.
- **Validation-error / action-error:** failed `decideApprovalAction` or assign → `role="alert"` destructive message in the actions footer ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in."); detail-fetch failure → error body ("Member not found.").
- **Submitting / pending:** decision or send-request in flight disables the relevant buttons; Approve/Send swaps to a spinner (`useTransition`).
- **Success:** decision succeeds → Approve/Reject disappear (status no longer pending), status pill + counts refresh (`revalidatePath` + `router.refresh()`, optimistic local flip). Assign-captain send → step 1 flips to "Done", step 2 "Pending"; dialog can close with the request now in-flight.
- **Disabled:** controls inert in locked state; (Ping placeholder permanently disabled if carried).
- **Gating states:**
  - **Invite-gated / not camp-active:** handled upstream (page redirect) and re-checked in every action ("Your account isn't camp-active yet.").
  - **Pending / rejected approval (subject):** these members are the *subjects* this surface acts on — the Pending filter + Approve/Reject. A *viewing* captain who is themselves unapproved is bounced upstream.
  - **Preview-but-locked (non-captain viewer):** the headline gating state for this surface — chrome renders, server sends zero rows, controls inert, `CaptainLock` panel shown, dialogs/profile not mounted. NOT a redirect, NOT a blocking overlay (decision #3).
  - **Assign-captain request states:** `sent` (awaiting acceptance), `accepted` (rank flips to captain), `declined`, `cancelled` — reflected in the dialog's step tracker and the target's role badge.
- **NOT applicable:** onboarding-incomplete gate (the gate spine runs before this page), offline/sync, budget/over-target.

---

## User actions

| Action | Result |
|---|---|
| Open page (captain) | Live roster + stats render |
| Open page (non-captain) | Preview-but-locked: chrome + `CaptainLock`, no data, inert controls (no redirect) |
| Back | Navigate to captain tools hub / `/` |
| Type in search | Client-side filter over name / handle / email / country / team |
| Toggle a status/cohort chip (All / Pending / Captains / Outstanding) | Client-side filter; chip → active |
| Open "Team:" dropdown, pick a team | Filter rows to that `teamEnum` membership |
| Tap a row | Open inline `MemberProfile`; fetch detail (captain-gated; decrypts ID) |
| Approve (pending member) | `decideApprovalAction(id, "approved")` → `approvalStatus = approved`; buttons clear; counts refresh |
| Reject (pending member) | Open Reject-confirm → on confirm `decideApprovalAction(id, "rejected")` (terminal/denied); on "Keep pending" → no-op |
| Assign captain rank | Open double-opt-in dialog → "Send request" inserts `captain_promotion_requests (status=sent)`; rank unchanged until target accepts in their own app |
| Cancel assign dialog | Close; no request created (or cancel an in-flight request → `status=cancelled`) |
| Close profile / dialog (Esc / X / scrim) | Clears selection / dismisses dialog |
| (Ping — if carried) | Disabled placeholder, "Coming soon" |

Self-guards: a captain cannot approve/reject/promote **their own** account.

---

## Data & enums (mapped to `schema.ts`)

**Reads (existing):**
- `users`: `id`, `displayName`, `profileImageUrl`, `rank` (`rankEnum: captain|member`), `isSystem`, `sanitised`, `approvalStatus` (`approvalStatusEnum: pending|approved|rejected`), `approvalDecidedByUserId`, `approvalDecidedAt`, `passportEncrypted`, `saIdEncrypted`, `inviteCode`, `telegramHandle`, `createdAt`. **Roster excludes `is_system = true` and `sanitised = true`.**
- `burner_profiles`: `responses` (jsonb — bio, ideas, country, dietary, emergency, arrival, `profile.image`, `id.type`, etc.), `completedAt` (drives onboarding-complete), `version`.
- `driver_profiles`: `intendsToDrive`, `completedAt` (driver facet — not surfaced by these boards' columns but available).
- `team_memberships`: `team` (`teamEnum`, 8 values), `isLead` → derived **Lead** badge + team-chip list + Team filter.
- `required_actions`: count of `status='pending' AND blocking=true` → `pendingRequiredActions` (Outstanding signal + INCOMPLETE stat).
- `invite_codes` (+ aliased inviter): provenance for the profile overview (invited-by / note).
- Decrypted `id.number` (from `passportEncrypted`/`saIdEncrypted` via pgcrypto AES-256-GCM, behind the captain gate) merged back into `responses` for the ID / Passport field.

**@handle:** reuse `users.telegramHandle` (or derive a slug from display name) — **no new column** unless product wants a distinct roster handle.

**Email:** sourced from the auth identity (Neon Auth `primaryEmail`), not a `users` column. Shown **in plaintext** on the profile — **PII flag** (decision carry).

**Status mapping (display → schema):** roster status pills derive from a precedence rule — `!onboardingComplete` → Onboarding; `approvalStatus='pending'` → Awaiting approval / "Pending"; `approvalStatus='rejected'` → Rejected; `pendingRequiredActions=0` → Ready; else → Action needed. The board's profile tag **"Accepted"/Approved is the display label for `approval_status='approved'`** (no new enum value).

**Writes (existing):** `decideApprovalAction` → `setUserApproval` stamps `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`.

**NEW schema (the only change in the redesign — decision #4):**
- **`captain_promotion_requests`** table: `id`, `target_user_id` (FK→users.id), `requested_by_user_id` (FK→users.id), `status` (`promotion_request_status`), `created_at`, `decided_at`.
- **`promotion_request_status`** enum: `sent | accepted | declined | cancelled`.
- Forward, non-breaking migration. **No DB nuke.** On `accepted`, app logic flips `users.rank → 'captain'`.

---

## Validation & edge cases

- **Captain gate is server-enforced, preview-but-locked** (decision #3): non-captains receive zero rows; every server action re-checks `rank === 'captain'`. Replaces the prior hard redirect.
- **Self-decision / self-promotion blocked:** a captain cannot approve, reject, or assign-captain their own account.
- **Decision whitelist:** only `approved` / `rejected` accepted; audit stamps decider + timestamp. Approve unblocks the member on next load; Reject is terminal (denied state).
- **Two-sided promotion is non-bypassable:** sending a request never flips rank; only the target's acceptance in their own app does. In-flight/duplicate requests for the same target should be idempotent (reuse the open `sent` row rather than creating duplicates); cancelling moves it to `cancelled`.
- **Assign-captain visibility:** action hidden when target is already `captain`, when viewer is not a captain, or for self.
- **Government ID PII:** `id.number` lives encrypted (`passport_encrypted`/`sa_id_encrypted`, keyed by `id.type`); decrypted **only** behind the captain gate and only in the detail action; decrypt errors fail closed (null). `id.type` stays in `responses` (not sensitive). Never shown in the locked view.
- **Member email is shown in plaintext** — **OPEN privacy decision to raise with the data owner** (decision carry; do not silently ship).
- **System & sanitised actors excluded** from the roster (AI/voice agent + POPIA-scrubbed accounts never appear).
- **Display-name fallback:** trimmed name or "Unnamed burner".
- **Stale-fetch protection:** rapid row switches discard earlier in-flight detail responses.
- **Empty profile sections dropped:** questionnaire pages with zero answered questions are skipped; intro pages always skipped; `profile.image` becomes the avatar, not a field row.
- **Country resolution:** ISO alpha-2 → label via `COUNTRIES`, fallback to raw code, null when unanswered; `ZA` drives any in-SA signal.
- **Counts must reconcile** between the stats strip, the chip counts, and the visible filtered rows.

---

## Flows

```
[captain navigates to /captains/camp-management]
  → server gate: authed? camp-active? approved? captain?
      → not captain → render chrome + CaptainLock (preview-but-locked, rows=[])   [exit-in-place]
      → captain → load roster + stats
          → search / filter chips / team dropdown  (client)
          → tap row → fetch detail (captain-gated, decrypt id.number) → MemberProfile
              → [member is pending]
                  → Approve → decideApprovalAction(approved) → status pill + counts refresh
                  → Reject → RejectConfirm → confirm → decideApprovalAction(rejected)  (terminal)
                            → "Keep pending" → dismiss, no change
              → [viewer captain, target not captain, not self]
                  → Assign captain rank → AssignCaptainDialog
                      → Send request → insert captain_promotion_requests(status=sent)
                          → target accepts in THEIR app → status=accepted → users.rank=captain
                          → target declines → status=declined ; captain cancels → status=cancelled
              → close → clear selection
```

Exits: close profile/dialog (in-place); Back → captain tools hub / `/`.

---

## Divergences from feature-set reference — and resolution

| Reference / live-code signal | Board (canonical) | Resolution per locked decisions |
|---|---|---|
| Live `/captains/*` **hard redirect** for non-captains; locked shell with blurred placeholder rows + bespoke "Captain access only" overlay | Boards show preview chrome + shared `CaptainLock` | **Decision #3:** preview-but-locked, not redirect; **decision #2:** unify on shared `CaptainLock`. Drop the bespoke overlay + redirect. |
| Terminal board ships its own `MemberReadOnly` / `RedactedID` / `LockedActions` read-only panel | — | **Decision #2:** dropped; both breakpoints use `CaptainLock`. |
| `S17 Captain mgmt` (Iteration A, Inter wide table) is the reference unit's layout | Iteration B (terminal + mobile) | **Decision #2:** Iteration B is canonical; A dropped. |
| Live surface has **no** assign-captain / promotion flow (rank is set only via invite codes) | Boards draw the two-sided assign-captain dialog | **Decision #4:** include it; add `captain_promotion_requests` + `promotion_request_status` (the only schema change). |
| Live columns: Rank · Status · Questionnaires · Driver · In SA · Country (7-col) | Boards columns: MEMBER · HANDLE · COUNTRY · ROLE (+ view) | Boards win on the visible columns; keep the live yes/no facets (questionnaires/driver/SA) available in the profile/Outstanding, not as roster columns. |
| Live search = name / team / country | Board placeholder "name, handle or email" | Boards win: add handle + email to search. |
| Live filter = "All" / "Awaiting approval" (2-way) | Boards = multi-chip (All / Pending / Captains / Team / Outstanding) | Boards win: multi-chip filters; "Pending" == live "Awaiting approval" (`approvalStatus='pending'`). |
| Live modal rank label = Captain/Member only | Roster row shows 🦩/🪄/🐱 (Captain/Lead/Member) | Roster row distinguishes all three (Lead derived from `is_lead`); profile tag may stay Captain/Member — flag the asymmetry. |
| Live "Ping" disabled placeholder | Boards omit Ping | Carry as an optional disabled future affordance; not board-required. |
| Profile shows full questionnaire-grouped answers | Boards show a curated field subset | Keep the full grouped profile; treat board fields as the priority overview ordering. |
| Status enum has no "Accepted" value | Profile tag reads "Accepted"/Approved | Display label only for `approval_status='approved'`; no new enum value. |

---

## Open questions / build reconciliations

1. ⛔ **Member email in plaintext (PII) — must resolve before build (privacy).** The profile renders the auth email unredacted to any captain. Decide with the data owner — redact/partial-mask, gate behind an explicit reveal, or accept as captain-tier-visible — and **record the chosen mitigation + owner here once made** (don't ship with it open). (decision carry).
2. **`@handle` source:** reuse `users.telegramHandle` (may be null / not unique) or derive a display slug? A dedicated roster-handle column is **not** added unless product asks. Confirm fallback when `telegramHandle` is null.
3. **Promotion request lifecycle UI:** where does the *target* accept/decline (their own app — which surface)? Does the requesting captain see a pending-requests list, or only the per-member dialog step state? Need the acceptance surface specced (likely home rank-section / notifications).
4. **Promotion + invite-code rank:** invite codes can already mint `assigned_rank='captain'`. Confirm the double-opt-in is the *only* in-app promotion path and that code-minted captains bypass it intentionally.
5. **Stat / chip semantics:** confirm exact definitions — "INCOMPLETE 7" vs "Outstanding 7" vs "Pending 3": are INCOMPLETE and Outstanding the same set (onboarding/required-actions) and Pending the approval queue? Reconcile so counts don't double-claim members.
6. **Profile field coverage vs board subset:** board lists Country/Email/Dietary/Emergency/Arrival/ID/Outstanding/"bring to camp". Confirm whether the inline profile shows ONLY these or the full grouped questionnaire (and whether tabs Overview/Profile from live code are retained or collapsed into one scroll).
7. **INCOMPLETE numeral token (mobile):** mobile uses `$accent`; terminal uses `$primary`/amber-warning intent. Reconcile to a single status token (decision #2 token carry).
8. **Demote / revoke captain:** the boards only assign captain rank. Is there a path to demote a captain back to member? Out of scope here — flag if product wants it.
