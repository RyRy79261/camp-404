# 14 — Captain camp management — roster & member detail

**Files covered:**
- `apps/web/app/captains/camp-management/page.tsx` — Server component route. Authn + invite + approval gating, then loads roster rows ONLY when the viewer is a captain; renders the page shell + `<CampManagementRoster locked={!isCaptain}>`.
- `apps/web/app/captains/camp-management/camp-management-roster.tsx` — `"use client"` roster table + per-member detail modal (tabs, approve/reject/ping actions, locked state, search/filter).
- `apps/web/app/captains/camp-management/actions.ts` — `"use server"` server actions: `requireCaptain` gate, `getMemberDetailAction`, `decideApprovalAction`. Decrypts the ID number behind the captain gate.
- `apps/web/lib/camp-roster.ts` — Pure view-model: `toRosterRow` collapses a `CampManagementMember` DB facet bundle into a `RosterRow` (status precedence, labels, derived flags).
- `apps/web/lib/member-detail.ts` — Pure view-model: `presentMemberDetail` builds the serializable `PresentedMember` (overview list + questionnaire-grouped profile sections + approval summary) from a `CampMemberDetail`.
- `packages/db/src/roster.ts` — DB queries: `getCampManagementRoster` (one row per real member with aggregated facets), `getCampMemberDetail` (full per-member detail incl. invite provenance + encrypted ID columns), `isTeamLead`.
- Supporting (followed via imports): `apps/web/lib/users.ts` (`ensureCampUser`, `hasCampAccess`, `isApproved`, `decideUserApproval`); `packages/db/src/burner-profile.ts` (`setUserApproval`); `packages/db/src/crypto.ts` (`decryptOrNull`, AES-256-GCM); `packages/db/src/id-documents.ts` (`mergeIdNumber`, `idColumnsFor`, key constants); `apps/web/lib/questionnaire.ts` + `apps/web/lib/countries.ts` (catalogue + country names); `packages/db/src/schema.ts` (`users`, `burner_profiles`, `driver_profiles`, `team_memberships`, `required_actions`, `invite_codes`).

**Purpose:** The captain-only "who is on camp and where are they up to" command surface. It renders one roster row per real (non-system, non-sanitised) camp member — rank, signup status, and yes/no facets (required questionnaires complete, registered driver, in South Africa) plus home country — searchable and filterable by "awaiting approval". Clicking a row opens a per-member modal (Overview + Profile tabs) that decrypts and shows the member's full burner-profile answers, invite provenance, and government ID; from it a captain can approve or reject a pending applicant (Ping is a disabled placeholder). Access is enforced server-side at the data layer, not by redirect: non-captains reach the page but see a blurred, data-free locked shell, and every server action re-checks captain rank.

## Features

### Page shell + server-side rank gate (`page.tsx`)
- `export const dynamic = "force-dynamic"` (page.tsx:10) — never statically cached.
- `metadata = { title: "Camp management — Camp 404" }` (page.tsx:12).
- Gating order (page.tsx:20-27): `getAuthenticatedUserOrRedirect()` (→ sign-in if unauthenticated) → `ensureCampUser(authUser)` → `if (!hasCampAccess(...)) redirect("/signup/required")` → `if (!isApproved(...)) redirect("/pending-approval")`.
- `isCaptain = campUser.rank === "captain"` (page.tsx:29).
- Data is loaded ONLY for captains: `rows = isCaptain ? (await getCampManagementRoster()).map(toRosterRow) : []` (page.tsx:31-33). The locked view receives ZERO data — clearance is enforced at the server, the comment stresses "non-captains can reach this page but see a locked, empty shell — the server never sends them roster data" (page.tsx:14-17, 30).
- Renders a back `Button` (ghost, sm) linking to `/` labelled "Captains" with a `ChevronLeft` icon (page.tsx:37-41).
- Header: H1 "Camp management" + descriptive paragraph: "Everyone who has signed up, their rank and status, whether they've completed their required questionnaires, registered as a driver, and whether they're in South Africa." (page.tsx:42-49).
- Layout container: `<main className="mx-auto max-w-5xl px-6 py-10">` (page.tsx:36). NOTE: this surface uses `max-w-5xl` (a wide table), not the global `max-w-lg`.
- `<CampManagementRoster rows={rows} locked={!isCaptain} />` (page.tsx:51).

### Roster table (`camp-management-roster.tsx` → `CampManagementRoster`)
- Counts/filter/search strip, hidden entirely when `locked` (lines 113-157).
- Two-button filter toggle group: "All ({rows.length})" and "Awaiting approval" + count badge when `awaitingCount > 0` (lines 116-145). Active filter styled `bg-muted text-foreground`, inactive `text-muted-foreground hover:text-foreground`.
- Search `<Input>` with leading `Search` icon, placeholder "Search name, team, country…", `aria-label="Search the roster"` (lines 146-155).
- 7-column table (lines 166-275): **Member** (display name + comma-joined humanized team list under it), **Rank** (pill), **Status** (pill), **Questionnaires** (`ShieldCheck` icon header, centered yes/no), **Driver** (`Car` icon header, centered yes/no), **In SA** (`Flag` icon header, centered yes/no), **Country** (`MapPin` icon header, country name or "—").
- Rank pill colour by `r.rank === "captain"` → `bg-primary/15 text-primary`; else `r.isLead` → `bg-sky-500/15 text-sky-400`; else → `bg-muted text-muted-foreground` (lines 226-237). Disambiguation by label text (`r.rankLabel`).
- Status pill colour from `STATUS_STYLE[r.status]` (lines 43-49). `title` tooltip on the pill = `"${pendingRequiredActions} outstanding action(s)"` when `pendingRequiredActions > 0`, with singular/plural ("action"/"actions") (lines 245-251).
- Rows are clickable: `onClick={() => setSelectedId(r.id)}`, `cursor-pointer hover:bg-muted/30` (lines 212-216).
- Empty-state messages (lines 197-209): filter `awaiting` → "Nobody is awaiting approval."; else `rows.length === 0` → "No members have signed up yet."; else "No members match your search." (rendered in a `colSpan={7}` cell).
- `YesNo` cell helper (lines 58-71): `value` true → emerald `Check` icon + sr-only "{label}: yes"; false → muted `Minus` (dash) icon + sr-only "{label}: no". sr-only labels: "Required questionnaires complete", "Registered as a driver", "In South Africa".
- `teamLabel(team)` (lines 51-56): splits on `_`, title-cases each word, joins with space (e.g. `power_and_lighting` → "Power And Lighting").

### Locked (non-captain) state (`camp-management-roster.tsx`)
- Filter/search strip is not rendered (`!locked` guard, line 113).
- Table wrapper gets `pointer-events-none select-none opacity-40 blur-[2px]` and `aria-hidden={locked}` (lines 159-165).
- Table body renders `<PlaceholderRows>` — 6 fake rows × 7 cells, each a `h-3 w-16 rounded bg-muted` block ("data here, but hidden") (lines 195, 527-541).
- An absolutely-positioned overlay card (lines 278-289): `Lock` icon, heading "Captain access only", body "Camp management data is visible to captains. Your rank doesn't have clearance for this view."
- The `MemberModal` is NOT mounted when locked (`!locked` guard, line 291) — rows aren't clickable anyway (no real ids).

### Per-member detail modal (`camp-management-roster.tsx` → `MemberModal`)
- Opens when a row is selected (`open = row != null`, line 321). Uses `Dialog`/`DialogContent` (`max-h-[85vh]`, `sm:max-w-lg`).
- Detail fetch (lines 326-343): on each new `rowId`, resets tab to "overview", clears `actionError`, sets `{ state: "loading" }`, calls `getMemberDetailAction(rowId)`; stale responses are discarded via a `cancelled` flag (race-safe when the captain clicks another burner before the first resolves).
- Header: `DialogTitle` = `row?.displayName ?? "Member"`; `DialogDescription` = `member.approvalSummary` while loaded, else "Loading…" (lines 379-384).
- Two tabs, "overview" and "profile" (rendered `capitalize`), active tab gets `border-b-2 border-primary` (lines 387-403).
- Loading body: spinning `Loader2`. Error body: `member.message` styled `text-destructive` (lines 406-415).
- Overview tab (lines 416-427): optional `profileImageUrl` `<img>` (80×80 rounded avatar, `alt=""`) + `<DetailList items={member.overview}>`.
- Profile tab (lines 428-445): if `profileSections.length === 0` → "No questionnaire answers on record yet."; else each section renders an uppercase title heading + `<DetailList items={section.items}>`.
- `DetailList` (lines 504-524): empty → "Nothing recorded."; else a `<dl>` of label (`dt`, muted) / value (`dd`, font-medium) pairs.
- Actions footer (lines 448-498): an "ACTIONS" caption + buttons. Approve/Reject shown ONLY while `isAwaiting` (`member?.approvalStatus === "pending"`). "Ping" button is permanently `disabled` with `title="Coming soon — nudge this member to check the app"` and a `ThumbsUp` icon — future feature (lines 488-496, 449-450 comment).
- `actionError` (if set) shown as `role="alert"` `text-destructive` above the buttons (lines 452-456).

### `getMemberDetailAction(userId)` (`actions.ts`)
- Captain-gated by `requireCaptain()` (returns the gate error if not ok) (lines 49-50).
- `getCampMemberDetail(userId)`; null → `{ ok: false, error: "Member not found." }` (lines 52-53).
- Behind the gate, decrypts the government ID number: `passport = decryptOrNull(detail.passportEncrypted)`, `saId = decryptOrNull(detail.saIdEncrypted)`; chooses `idType` "passport" if passport present, else "sa_id" if saId present, else null (lines 58-64). Merges it back into `responses` via `mergeIdNumber` so the modal can show it (line 65). Comment: "Captains and the owner are the only readers of this field."
- Returns `{ ok: true, member: presentMemberDetail({ ...detail, responses }) }` (line 67).

### `decideApprovalAction(userId, decision)` (`actions.ts`)
- Captain-gated by `requireCaptain()` (lines 79-80).
- Validates `decision` is `"approved"` or `"rejected"` → else `{ ok: false, error: "Unknown decision." }` (lines 82-84).
- Self-decision guard: `if (userId === gate.captainId) return { ok: false, error: "You can't decide on your own account." }` (lines 85-87).
- Persists via `decideUserApproval({ userId, status: decision, decidedByUserId: gate.captainId })` (lines 89-93) → `setUserApproval` stamps `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt` (burner-profile.ts:69-84).
- `revalidatePath("/captains/camp-management")` then `{ ok: true }` (lines 94-95). Comment: "Approving unblocks the app on their next load; rejecting holds them at the blocking screen with a terminal message" (lines 70-73).
- Client `decide()` (roster.tsx:345-366) additionally calls `router.refresh()` and optimistically patches local `member.approvalStatus = decision` so the approve/reject buttons disappear immediately.

### `requireCaptain()` gate (`actions.ts:30-43`)
- `getAuthenticatedUser()`; null → `{ ok: false, error: "Not signed in." }`.
- `ensureCampUser(authUser)`; `!hasCampAccess(...)` → `{ ok: false, error: "Your account isn't camp-active yet." }`.
- `campUser.rank !== "captain"` → `{ ok: false, error: "Captain access only." }`.
- Else `{ ok: true, captainId: campUser.id }`.

### `getCampManagementRoster()` (`roster.ts:48-110`)
- Selects one row per `users` row, left-joining `burner_profiles` and `driver_profiles`. Derived columns computed in SQL:
  - `country` = `burner_profiles.responses->>'country'` (string|null).
  - `intendsToDrive` = `coalesce(driver_profiles.intends_to_drive, false)`.
  - `isLead` = `exists (select 1 from team_memberships tm where tm.user_id = users.id and tm.is_lead = true)`.
  - `teams` = `coalesce((select array_agg(tm.team order by tm.team) from team_memberships ...), '{}')`.
  - `pendingRequiredActions` = `(select count(*)::int from required_actions ra where ra.user_id = users.id and ra.status = 'pending' and ra.blocking = true)`.
- `onboardingComplete` = `burner_profiles.completedAt != null`; `driverProfileComplete` = `driver_profiles.completedAt != null`.
- `WHERE users.is_system = false AND users.sanitised = false` (excludes the AI/voice agent and POPIA-sanitised accounts) (lines 89-91).
- `ORDER BY users.display_name ASC` (line 92).

### `getCampMemberDetail(userId)` (`roster.ts:141-198`)
- Single row by `users.id = userId`, with three left joins: `decider` (aliased `users`, on `approval_decided_by_user_id`) for `approvalDecidedByName`; `burner_profiles` for `responses`/`completedAt`/`version`; `invite_codes` (on `users.invite_code = invite_codes.code`) for `inviteNote`; `inviter` (aliased `users`, on `invite_codes.created_by_user_id`) for `invitedByName` (lines 145-176).
- Returns `null` if no row (line 180). Reads raw `passportEncrypted`/`saIdEncrypted` ciphertext (not decrypted here). `responses` defaults to `{}` when null (line 190).

### View-model derivation (`camp-roster.ts`, `member-detail.ts`)
- `toRosterRow` (camp-roster.ts:60-94) — see Validation section for the status precedence rule.
- `rankLabel(rank, isLead)` (camp-roster.ts:97-101): captain → "Captain"; else isLead → "Team Lead"; else "Member".
- `country` resolved to a human name via `COUNTRY_NAME` map (ISO alpha-2 → label), falling back to the raw code, or `null` when unanswered (camp-roster.ts:89-92).
- `inSouthAfrica` = `member.country === "ZA"` (camp-roster.ts:92).
- `presentMemberDetail` (member-detail.ts:111-176) builds: `displayName` (trimmed, fallback "Unnamed burner"), `rankLabel` (captain → "Captain", else "Member" — NOTE: this modal-level label does NOT express Team Lead, unlike the roster row), `approvalSummary` (see `describeApproval`), `profileImageUrl` (from `responses["profile.image"]` if a string), `overview` list, and `profileSections`.
- `overview` items, in order (member-detail.ts:121-149): Country (if answered), Joined (`createdAt` formatted), Onboarding ("Complete"/"Incomplete"), Invite code (`inviteCode` or "— (founder / god account)"), Invited by (if `invitedByName`), Invite note (if `inviteNote`).
- `profileSections` (member-detail.ts:151-164): iterate `QUESTIONNAIRE.pages`, skip non-`"questions"` pages, render each answered question as `{ label: question.prompt, value }` via `renderAnswer`, drop pages with zero answered questions. Section title = page `title`.
- `renderAnswer` (member-detail.ts:46-85): null/empty → null (skipped); `image` → null (surfaced as avatar instead); `multi_select` → comma-joined option labels (null if empty array); `single_select`/`scale`/`toggle`/`combobox` → resolved option label (scale uses `steps`, others use `options`, fall back to raw value); `slider` → `String(raw)`; `date`/`short_text`/`long_text`/default → `String(raw)`.
- `describeApproval` (member-detail.ts:87-109): approved → "Approved by {name} on {date}" (or "Approved" if no decider); rejected → "Rejected by {name} on {date}" (or "Rejected"); pending/default → "Awaiting a captain's decision". Date via `Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" })`.

## User actions & interactions
- **Open the page** (captain): see live roster. (Non-captain): see blurred locked shell + "Captain access only" card; no interactions available.
- **Back to Captains**: ghost button → `/`.
- **Switch filter tab**: "All" ⇄ "Awaiting approval" (client-side `setFilter`).
- **Search**: type into the search box; filters rows by display name, rank label, country, or any humanized team name (case-insensitive, trimmed) (roster.tsx:91-103).
- **Click a row**: opens the member modal and fetches detail (`getMemberDetailAction`).
- **Switch modal tab**: Overview ⇄ Profile.
- **Approve a pending applicant**: green "Approve" button → `decideApprovalAction(id, "approved")`; optimistic local update + `router.refresh()`.
- **Reject a pending applicant**: destructive "Reject" button → `decideApprovalAction(id, "rejected")`.
- **Ping** (disabled placeholder, "Coming soon"): no action.
- **Close modal**: `onOpenChange(false)` (overlay/Esc/X) → clears `selectedId`.

## States & presentations
Global-states rows that apply to THIS surface:
- **Empty**: `rows.length === 0` → "No members have signed up yet."; filtered-to-zero → "No members match your search." / "Nobody is awaiting approval."; modal profile with no answers → "No questionnaire answers on record yet." / `DetailList` empty → "Nothing recorded."
- **Loading**: modal detail fetch → `{ state: "loading" }`, spinning `Loader2`; header description shows "Loading…".
- **Populated**: roster rows rendered; modal `{ state: "loaded" }` with overview + profile sections.
- **Validation-error / action-error**: modal footer `actionError` (`role="alert"`, destructive) from a failed `decideApprovalAction` ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in."). Detail-fetch failure → `{ state: "error" }` body ("Member not found." or any gate error).
- **Submitting/pending**: `isPending` (`useTransition`) disables both Approve/Reject; Approve swaps its icon for a spinning `Loader2`.
- **Success**: decision succeeds → approve/reject buttons disappear (approvalStatus no longer "pending"); table refreshed via `revalidatePath` + `router.refresh()`.
- **Disabled**: "Ping" button always disabled.
- **Invite-gated**: handled upstream — `!hasCampAccess` → redirect `/signup/required` (page) / "Your account isn't camp-active yet." (actions).
- **Pending-approval / Rejected**: these are the SUBJECTS this surface acts on (the awaiting-approval filter + approve/reject). The *viewing* captain, if not approved, is bounced to `/pending-approval` by the page gate; rejected viewers never reach it.
- **Captain-only-locked**: non-captain viewer → blurred, data-free, `aria-hidden` table with placeholder rows + overlay "Captain access only" card; all controls and the modal suppressed. Server sends `rows=[]`.
- NOT applicable: onboarding-incomplete (no nextGate logic here — the gate spine runs before this page; this page only redirects on invite/approval), offline/sync, budget/over-target.

## Enums, options & configurable values
- **`RosterStatus`** (camp-roster.ts:8-13): `"ready" | "onboarding" | "awaiting_approval" | "rejected" | "pending"`.
- **`STATUS_LABEL`** (camp-roster.ts:43-49): ready→"Ready", onboarding→"Onboarding", awaiting_approval→"Awaiting approval", rejected→"Rejected", pending→"Action needed".
- **`STATUS_STYLE`** (roster.tsx:43-49): ready→`bg-emerald-500/15 text-emerald-400`, onboarding→`bg-amber-500/15 text-amber-400`, awaiting_approval→`bg-sky-500/15 text-sky-400`, rejected→`bg-rose-500/15 text-rose-400`, pending→`bg-rose-500/15 text-rose-400` (rejected and pending share the same rose style).
- **Rank labels** (camp-roster.ts:97-101): "Captain" / "Team Lead" / "Member".
- **`Filter`** type (roster.tsx:73): `"all" | "awaiting"`. Filter labels: "All ({count})", "Awaiting approval".
- **Modal tabs** (roster.tsx:317, 388): `"overview" | "profile"`.
- **`DetailState`** (roster.tsx:303-306): `{state:"loading"} | {state:"loaded";member} | {state:"error";message}`.
- **Stored ranks** (`rankEnum`, schema.ts:31): `["captain","member"]`.
- **`approvalStatusEnum`** (schema.ts:41-45): `["pending","approved","rejected"]`.
- **`teamEnum`** (schema.ts:51-60): `kitchen, structures, power_and_lighting, sanitation_and_water, health_and_safety, art_and_activities, ministry_of_memes, ministry_of_vibes` (8 values).
- **`membershipTierEnum`** (schema.ts:62-65): `["full","build_week_only"]`. (Read into `CampManagementMember.membershipTier` but NOT surfaced by either view-model — see dead-fields note.)
- **`decision` arg**: `"approved" | "rejected"` only.
- **ID types** (id-documents.ts:7-8, 43-49): keys `ID_NUMBER_KEY = "id.number"`, `ID_TYPE_KEY = "id.type"`; types `"passport"` → `passportEncrypted`, `"sa_id"` → `saIdEncrypted`, default → passport column.
- **Special country value**: `"ZA"` drives `inSouthAfrica`. Country values are ISO 3166-1 alpha-2 codes; labels from `COUNTRIES`.
- **Date format**: `Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" })`.
- **Placeholder grid**: 6 rows × 7 columns.
- **Crypto** (crypto.ts): AES-256-GCM, `KEY_SALT = "camp404-pgcrypto-v1"`, key from `PGCRYPTO_KEY` (≥16 chars), stored as base64(iv‖tag‖ciphertext), iv 12 bytes, tag 16 bytes.
- **`QUESTIONNAIRE.version`**: `"2026.05.29-v8"` (questionnaire.ts:60) — stamped on `required_actions` / `burner_profiles` elsewhere; section titles consumed here come from `QUESTIONNAIRE.pages[*].title` (e.g. "Add a profile photo", "About you", "A bit about you", "Your ideas for this year's burn", "Team interests", "Cooking competency", "Hardware competency", "Leadership & logistics", "Burn history", "Coming to burn this year?", "Dietary requirements").

## Data model touched
All reads/writes server-side (Neon Postgres via Drizzle). Tables & exact field names:

- **`users`** (schema.ts:220-303): `id`, `authUserId` (`auth_user_id`), `displayName` (`display_name`), `profileImageUrl` (`profile_image_url`), `rank` (`rankEnum`), `isSystem` (`is_system`), `membershipTier` (`membership_tier`), `duesPaid` (`dues_paid`), `passportEncrypted` (`passport_encrypted`), `saIdEncrypted` (`sa_id_encrypted`), `inviteCode` (`invite_code`), `approvalStatus` (`approval_status`), `approvalDecidedByUserId` (`approval_decided_by_user_id`, FK→users.id, onDelete set null), `approvalDecidedAt` (`approval_decided_at`), `sanitised`, `createdAt` (`created_at`), `updatedAt` (`updated_at`).
  - WRITE: `decideApprovalAction` → `setUserApproval` sets `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`.
- **`burner_profiles`** (schema.ts:352-364): `userId` (`user_id`, PK, FK→users.id cascade), `version`, `responses` (jsonb `Record<string,unknown>`), `startedAt`, `completedAt` (`completed_at` — drives `onboardingComplete`), `updatedAt`. `responses->>'country'` and `responses["profile.image"]` and per-question answers are read.
- **`driver_profiles`** (schema.ts:393-420): `userId` (`user_id`, PK), `intendsToDrive` (`intends_to_drive` — drives `isDriver`), `completedAt` (`completed_at` — drives `driverProfileComplete`). (Other driver columns exist but aren't read by this surface.)
- **`team_memberships`** (schema.ts:446-460): `userId` (`user_id`), `team` (`teamEnum`), `isLead` (`is_lead` — drives derived `isLead` and team list). Read via SQL subqueries.
- **`required_actions`**: `user_id`, `status` (= `'pending'`), `blocking` (= `true`) counted into `pendingRequiredActions`.
- **`invite_codes`** (joined): `code`, `note` (→ `inviteNote`), `created_by_user_id` (→ `invitedByName` via aliased users join).
- **`CampManagementMember`** interface (roster.ts:15-38): `id`, `displayName`, `rank`, `approvalStatus`, `isLead`, `teams: string[]`, `duesPaid`, `membershipTier`, `onboardingComplete`, `pendingRequiredActions`, `intendsToDrive`, `driverProfileComplete`, `country: string|null`, `createdAt`.
- **`CampMemberDetail`** interface (roster.ts:117-139): `id`, `displayName`, `rank`, `approvalStatus`, `approvalDecidedAt`, `approvalDecidedByName`, `onboardingComplete`, `onboardingVersion`, `responses`, `passportEncrypted`, `saIdEncrypted`, `inviteCode`, `inviteNote`, `invitedByName`, `createdAt`.
- **`RosterRow`** view-model (camp-roster.ts:15-39): `id`, `displayName`, `rankLabel`, `rank`, `isLead`, `teams`, `status`, `statusLabel`, `approvalStatus`, `awaitingApproval`, `onboardingComplete`, `pendingRequiredActions`, `requiredComplete`, `isDriver`, `driverProfileComplete`, `country: string|null`, `inSouthAfrica`.
- **`PresentedMember`** view-model (member-detail.ts:26-37): `id`, `displayName`, `rankLabel`, `approvalStatus`, `approvalSummary`, `profileImageUrl: string|null`, `overview: DetailItem[]`, `profileSections: DetailSection[]`. `DetailItem={label,value}`, `DetailSection={title,items}`.

## Validation, edge cases & business rules
- **Status precedence** (camp-roster.ts:60-71): `!onboardingComplete` → `onboarding`; else `approvalStatus==="pending"` → `awaiting_approval`; else `approvalStatus==="rejected"` → `rejected`; else `requiredComplete` (i.e. `pendingRequiredActions === 0`) → `ready`; else → `pending` ("Action needed"). Approval sits above generic required-actions because it blocks the member from the app entirely (comment lines 51-58).
- **`awaitingApproval` / "Awaiting approval" filter** = `approvalStatus === "pending"` (camp-roster.ts:62, 28-29).
- **`requiredComplete`** = `pendingRequiredActions === 0` (camp-roster.ts:61).
- **Display name fallback**: trimmed name or `"Unnamed burner"` (camp-roster.ts:75, member-detail.ts:168).
- **Captain gate is enforced server-side, not by redirect**: non-captains load the page but get `rows=[]`; every action calls `requireCaptain()`. The page comment is explicit (page.tsx:14-17, 30; roster.tsx:36-41).
- **Self-decision blocked**: a captain cannot approve/reject their own account (`userId === gate.captainId`) (actions.ts:85-87).
- **Decision whitelist**: only `"approved"`/`"rejected"` accepted (actions.ts:82-84).
- **Decision audit**: stamps `approvalDecidedByUserId` + `approvalDecidedAt` (burner-profile.ts:69-84). `approvalDecidedByName` shown in the modal summary.
- **Approve unblocks / Reject is terminal**: approving lets the member into the app on next load; rejecting holds them at the blocking screen (actions.ts:70-73; schema.ts:33-45 — `rejected` is a terminal denied state).
- **Stale-fetch protection**: rapid row switches discard the earlier in-flight detail response (roster.tsx:326-343).
- **System & sanitised actors excluded** from the roster query (`is_system=false AND sanitised=false`) — the AI/voice agent and POPIA-scrubbed accounts never appear (roster.ts:89-91).
- **Government ID PII**: `id.number` is split out of `responses` into encrypted `passport_encrypted`/`sa_id_encrypted` columns; decrypted ONLY behind the captain gate in `getMemberDetailAction` and merged back via `mergeIdNumber` (which keeps `id.type` in responses, only injects `id.number` if present). `decryptOrNull` swallows decrypt errors → returns null (crypto.ts:72-79). `id.number` is rendered as a `short_text` answer row in the Profile tab via its questionnaire question prompt.
- **`profile.image` answer is NOT a profile row** — it becomes the avatar; `renderAnswer` returns null for `image` kind (member-detail.ts:65-66).
- **Country resolution**: code→label via `COUNTRY_NAME`, falling back to the raw stored value; null when unanswered (both view-models).
- **Empty profile sections dropped**: pages with zero answered questions are skipped (member-detail.ts:161-163); intro pages (`kind !== "questions"`) always skipped (member-detail.ts:155).
- **`scale` vs other selects**: `scale` resolves labels from `question.steps`, every other labelled kind from `question.options` (member-detail.ts:51-62).
- **`revalidatePath` + `router.refresh()`**: after a decision the server data behind the table is re-fetched so the row's status pill updates; the modal optimistically flips locally first.

## Sub-components / variants
- `CampManagementRoster` — main client table + controls.
- `YesNo` — tick/dash cell (roster.tsx:58-71).
- `MemberModal` — per-member dialog with Overview/Profile tabs + actions footer (roster.tsx:308-502).
- `DetailList` — label/value `<dl>` renderer (roster.tsx:504-524).
- `PlaceholderRows` — 6×7 skeleton grid for the locked state (roster.tsx:527-541).
- Server units: `requireCaptain` (gate), `getMemberDetailAction`, `decideApprovalAction` (actions.ts); `getCampManagementRoster`, `getCampMemberDetail`, `isTeamLead` (roster.ts); `toRosterRow`, `rankLabel` (camp-roster.ts); `presentMemberDetail`, `renderAnswer`, `describeApproval` (member-detail.ts).
- **DEAD / orphaned / placeholder**:
  - **"Ping" button** — permanently `disabled`, "Coming soon" tooltip; no handler (roster.tsx:488-496). Future feature.
  - **`isTeamLead(userId)`** (roster.ts:204-217) — exported from this file but NOT used by the camp-management surface (it powers the control panel's team-lead layer elsewhere). Documented here only because it lives in `roster.ts`.
  - **`CampManagementMember.duesPaid` and `.membershipTier`** — fetched by `getCampManagementRoster` (roster.ts:58-59, 98-99) but NEVER read by `toRosterRow` or rendered. Likewise `CampMemberDetail.onboardingVersion` is fetched but unused by `presentMemberDetail`. Dead-but-fetched fields ("explicitly growing surface" — roster.ts:10-13).
  - **`RosterRow.driverProfileComplete`** — derived in `toRosterRow` (camp-roster.ts:88) but not rendered by the table (the Driver column uses `isDriver`/`intendsToDrive`, not completion).
  - **Modal `rankLabel`** (member-detail.ts:169) only distinguishes Captain vs Member — it does NOT surface "Team Lead", unlike the roster row's `rankLabel`. Intentional asymmetry / minor inconsistency.
