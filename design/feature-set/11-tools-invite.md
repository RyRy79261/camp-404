# 11 — Invite tool (mint codes)

**Files covered:**
- `apps/web/app/tools/invite/page.tsx` — server page; auth + invite-gate + approval-gate, renders back-link and `<InviteForm isCaptain={…} />`.
- `apps/web/app/tools/invite/invite-form.tsx` — client form; code field, captain-only knobs, live availability check, submit, success panel.
- `apps/web/app/tools/invite/actions.ts` — `createInviteAction` server action; the security boundary that validates + inserts the invite code.
- `apps/web/lib/invite-words.ts` — readable word-bank code generator + syntactic validator + rules-hint string.
- `apps/web/app/api/tools/invite/check/route.ts` — `GET` availability oracle (auth-gated, rate-limited) backing the live "is this taken?" hint.
- `packages/db/src/invite-codes.ts` — `createInviteCode` / `findInviteCodeByCode` / `findUsableInviteCode` / `consumeInviteCode` data access + `InviteCodeRow` interface.
- `packages/db/src/schema.ts:312-342` — `invite_codes` table definition (the data model touched).
- `apps/web/lib/rate-limit.ts` — in-memory token bucket used to throttle the check endpoint.
- `apps/web/lib/users.ts` — `ensureCampUser`, `hasCampAccess`, `isApproved` gating used by the page and action (read for gate semantics only; redemption itself is unit 03).
- `apps/web/lib/test-store.ts:45-57, 313-352` — `TestInviteCode` shape + `seedInviteCode`/`findUsableInviteCode`/`consumeInviteCode` (E2E test backend; relevant to the check route).
- `apps/web/app/tools/page.tsx:28-34` — Tools hub entry that links here (`/tools/invite`, "Invite a member", `Mail` icon).

**Purpose:** Lets any signed-in, camp-active, approved member mint an invite code from inside the app to bring one (or, for captains, several) new people onto Camp 404. A member's codes are always single-use, tied to one required email, and force the redeemer into the captain vetting queue. A captain gets two extra knobs: **pre-approve** (wave the redeemer straight in, skipping vetting) and **max-uses** (1-100, hand one code to several people). Codes are generated as memorable "silly" word combos ("neon-toaster-mongoose"), are editable, are checked for availability GitHub-style as you type, and are recorded against the minter's account so the family tree can attribute who brought whom. Captain-tier (rank-promoting) codes can NOT be minted here — only from the CLI; this surface always inserts `assignedRank = NULL`.

## Features

### Page shell + gating (`page.tsx`)
- `export const dynamic = "force-dynamic"` (`page.tsx:8`); `metadata.title = "Invite — Camp 404"` (`page.tsx:10`).
- Resolves the auth user via `getAuthenticatedUserOrRedirect()` then `ensureCampUser(authUser)` (`page.tsx:13-14`).
- **Invite gate:** if `!hasCampAccess(campUser, authUser.primaryEmail)` → `redirect("/signup/required")` (`page.tsx:15-17`). `hasCampAccess` = god email OR a non-null `inviteCode` (`users.ts:219-224`).
- **Approval gate:** if `!isApproved(campUser, authUser.primaryEmail)` → `redirect("/pending-approval")` (`page.tsx:18-20`). `isApproved` = god email OR `approvalStatus === "approved"` (`users.ts:231-236`). (No explicit `rejected` branch here; rejected users are non-approved so they hit `/pending-approval` too.)
- Layout: `<main className="mx-auto max-w-xl px-6 py-10">` (note: `max-w-xl`, wider than the global `max-w-lg`). Ghost back-button "Tools" with `ChevronLeft` linking `/tools` (`page.tsx:23-28`).
- Passes `isCaptain={campUser.rank === "captain"}` into the form (`page.tsx:29`) — the sole rank input the client sees.

### Invite form (`invite-form.tsx`)
- Header: title **"Invite a member"**; description text branches on `isCaptain` (`invite-form.tsx:107-112`):
  - Captain: "Mint an invite code for Camp 404. As a captain you can pre-approve the people who sign up, or leave them for a captain to vet. Codes are recorded against your account for the family tree."
  - Member: "Mint a single-use code that lets one person sign up for Camp 404. A captain will review and approve them before they get access. Codes are recorded against your account so the family tree picks up who you brought on."
- **Email field** (`name="email"`, `type="email"`, `autoComplete="off"`, placeholder `sara@example.com`). Label and `required` flip on `multiUse` (`invite-form.tsx:39, 116-128`):
  - `multiUse` = `isCaptain && Number(maxUses) > 1`.
  - Multi-use: label "Lead recipient's email (optional)", `required={false}`.
  - Otherwise: label "Their email address", `required`.
- **Note field** (`name="note"`, `<Textarea rows={3}>`): label "Why you're inviting them (optional)", placeholder "Kitchen lead from last burn; great with sourdough." (`invite-form.tsx:130-138`).
- **Captain options block** rendered only when `isCaptain` (`invite-form.tsx:140-152`); otherwise a muted notice: "Anyone who signs up with this code will need a captain's approval before they can use the app." (`invite-form.tsx:148-151`).
- **Invite code field** (`name="code"`, `font-mono`, `spellCheck=false`, `autoComplete="off"`): controlled by `code` state, seeded once via `generateInviteCode()` (`invite-form.tsx:31`). `onChange` lowercases input (`invite-form.tsx:161`). Adjacent **Shuffle** outline icon-button (aria-label "Generate a new silly code") re-rolls a fresh code (`invite-form.tsx:166-174`).
- **Live availability hint** under the code field (`<AvailabilityHint>`), driven by the debounced check (see below).
- **Error banner**: when `result && !result.ok`, a `role="alert"` destructive box shows `result.error` (`invite-form.tsx:179-186`).
- **Submit button** ("Create invite"): full-width; when `isPending` shows spinner + "Creating…" (`invite-form.tsx:188-205`). Disabled when `isPending || availability.state === "checking" | "taken" | "invalid"` (`invite-form.tsx:190-195`). (Notably NOT disabled in `idle` or `available` states.)
- Form submission goes through `useActionState(createInviteAction, null)` (`invite-form.tsx:41-44`).
- On `result.ok` the whole card is replaced by `<SuccessPanel>` (`invite-form.tsx:93-102`).

### Live availability check (`invite-form.tsx` effect + `check/route.ts`)
- `useEffect` on `[code]` (`invite-form.tsx:48-91`):
  - Empty code → `availability = { state: "idle" }`.
  - `!isSyntacticallyValidCode(code)` → `{ state: "invalid", hint: "3–48 chars, lowercase letters / digits / hyphens." }` (client-side hint string, note the trailing-period differs from the server `CODE_RULES_HINT`).
  - Else set `{ state: "checking" }`, debounce **350 ms**, then `fetch(/api/tools/invite/check?code=<encoded>)` with an `AbortController` (cleanup aborts + clears the timer).
  - Response `{ available, reason?, hint? }` maps: `available:true`→`available`; `reason==="taken"`→`taken`; `reason==="invalid"`→`{invalid, hint: body.hint ?? "Invalid code."}`; anything else→`idle`. `AbortError` is swallowed; other errors → `idle` (`invite-form.tsx:73-85`).
- `GET /api/tools/invite/check` (`check/route.ts`): `runtime = "nodejs"`.
  - **Auth-gated:** no user → `401 {error:"unauthorized"}` (`check/route.ts:18-22`).
  - **Rate-limited:** key `invite-check:<user.id>`, `limit: 30` per `windowMs: 60_000`; over limit → `429 {error:"rate_limited"}` with `retry-after` header (`check/route.ts:24-37`).
  - Reads `code` query param, `.trim().toLowerCase()`. Empty → `{available:false, reason:"empty", hint: CODE_RULES_HINT}` (`check/route.ts:42-48`). Invalid syntax → `{available:false, reason:"invalid", hint: CODE_RULES_HINT}` (`check/route.ts:49-55`).
  - Existence: in E2E mode uses `testStore.findUsableInviteCode(raw)`; otherwise `findInviteCodeByCode(raw)` (`check/route.ts:57-59`). Existing → `{available:false, reason:"taken"}`; else `{available:true}`.
  - `<!-- low-confidence: test/prod existence mismatch is real, not a guess. In prod findInviteCodeByCode matches ANY row (revoked/expired/exhausted included, per its docstring lines 111-118). In E2E mode testStore.findUsableInviteCode excludes revoked/expired/exhausted rows — so a dead code reads "available" in tests but "taken" in prod. Flagging as an ugly truth. -->

### Code generator (`invite-words.ts`)
- `generateInviteCode()` returns ``${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(NOUNS)}`` — one adjective + two nouns, hyphen-joined, e.g. `neon-toaster-mongoose` (`invite-words.ts:45-47`). `pick` is `Math.random()`-based uniform choice. Note: the two noun picks are independent, so duplicate nouns (e.g. `neon-yak-yak`) are possible.
- Namespace is ~50 adjectives × ~50 nouns × ~50 nouns; docstring (`invite-words.ts:7-11`) warns collision-by-luck is plausible and the caller MUST re-check the DB.
- `isSyntacticallyValidCode(raw)` (`invite-words.ts:57-60`): length 3-48 inclusive AND matches `CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/` (lowercase letters/digits, single hyphens between segments, no spaces, no leading/trailing hyphen).
- `CODE_RULES_HINT = "3–48 chars, lowercase letters / digits / hyphens (no spaces)."` (`invite-words.ts:62-63`) — used by the API route (the client effect hardcodes a slightly different string).

### Mint action (`createInviteAction`, `actions.ts`)
The server-side security boundary. Re-validates everything regardless of what the form sent (`actions.ts:30-46` docstring). Steps:
1. **Auth:** `getAuthenticatedUser()`; null → `{ok:false, error:"Not signed in."}` (`actions.ts:52-53`).
2. **Camp access:** `ensureCampUser` + `hasCampAccess`; fail → `{ok:false, error:"Your account isn't camp-active yet."}` (`actions.ts:55-58`).
3. Recompute `isCaptain = campUser.rank === "captain"` server-side (`actions.ts:59`) — the client `isCaptain` prop is never trusted.
4. Read `email`, `note`, `code` from `FormData` (string-guarded, default `""`) (`actions.ts:61-72`).
5. **Captain knobs re-enforced server-side** (`actions.ts:74-93`):
   - `preApprove = isCaptain && formData.get("preApprove") === "on"`; `requiresApproval = !preApprove`. A non-captain can never set `preApprove`, so their codes always `requiresApproval = true`.
   - `maxUses` defaults `1`. Only a captain may raise it: parse `maxUses`, must be an integer in `[1, MAX_USES_LIMIT]` (=100) else `{ok:false, error:"Max uses must be a whole number between 1 and 100."}`. A non-captain's `maxUses` form value is ignored entirely.
6. **Email rules** (`actions.ts:96-105`): `email = emailRaw.trim().toLowerCase()`; `emailRequired = maxUses === 1`. If `email` present and fails `EMAIL_PATTERN` → `{ok:false, error:"Enter a valid email address."}`. If `emailRequired && !email` → same error. (Multi-use captain code may omit email.)
7. `note = noteRaw.trim() || null`.
8. **Code resolution** (`actions.ts:108-125`): `code = codeRaw.trim().toLowerCase()`. If supplied: `isSyntacticallyValidCode` else `{ok:false, error:"Invite code must be 3–48 chars, lowercase letters/digits/hyphens."}`; then `findInviteCodeByCode(code)` — if found → `{ok:false, error:"'<code>' is already taken."}`. If blank: `code = await generateUnusedCode()`.
9. **Insert** via `createInviteCode({ code, createdByUserId: campUser.id, note, maxUses, assignedRank: null, invitedEmail: email || null, requiresApproval })` (`actions.ts:127-136`). `assignedRank` is **always `null`** (captain-tier codes are CLI-only, `actions.ts:33-36`).
10. Insert wrapped in try/catch: any DB error (incl. unique-PK race) → `{ok:false, error:"Couldn't save invite. Try a different code."}` (`actions.ts:137-141`).
11. Success → `{ok:true, code, invitedEmail: email, maxUses, requiresApproval}` (`actions.ts:143`).
- `generateUnusedCode()` (`actions.ts:146-155`): up to **8** attempts of `generateInviteCode()` + `findInviteCodeByCode` DB check, returning the first unused candidate; after 8 collisions falls back to ``${generateInviteCode()}-${Date.now().toString(36)}``.
- Note: this action does NOT branch on E2E_TEST_MODE — it always calls the real-DB `findInviteCodeByCode`/`createInviteCode` (unlike the check route, which has a test-store branch).

### Success panel (`SuccessPanel`, `invite-form.tsx:317-368`)
- Title "Invite ready". Description: `"Share this code with <email>. "` if `email` else `"Share this code. "`, then:
  - `usesLine`: `maxUses === 1` → "It's single-use — once they sign up with it, nobody else can." else "Up to `<maxUses>` people can sign up with it." (`invite-form.tsx:329-332`).
  - `approvalLine`: `requiresApproval` → " They'll need a captain's approval before they get access." else " They're pre-approved — straight in after onboarding." (`invite-form.tsx:333-335`).
- Code shown in a `font-mono text-lg` box with a **Copy** button → `navigator.clipboard.writeText(code)`, flips label to "Copied" for 1500 ms (`invite-form.tsx:347-361`).
- **"Send another"** outline link to `/tools/invite` (full reload resets the form) (`invite-form.tsx:362-364`).

## User actions & interactions
- **Type / edit the code** — input lowercases on change; triggers the debounced availability check.
- **Shuffle** — re-roll a fresh generated code (button, `Shuffle` icon).
- **Enter recipient email** — required for single-use, optional ("lead recipient") for captain multi-use.
- **Enter a note** ("Why you're inviting them") — always optional.
- **(Captain) toggle "Pre-approve whoever signs up"** — checkbox `name="preApprove"`; controls vetting.
- **(Captain) set "How many people can use this code"** — number input `name="maxUses"`, `min={1} max={100}`, `w-28`.
- **Submit "Create invite"** — runs the server action; button disabled while checking/taken/invalid/pending.
- **Copy** (success) — copies code to clipboard, transient "Copied" feedback.
- **Send another** (success) — navigates back to a fresh form.
- **Back to Tools** — ghost `ChevronLeft` link to `/tools`.

## States & presentations
Global-state rows that apply to this surface:
- **Empty / initial:** form pre-filled with a generated code; email/note blank; captain knobs default (pre-approve off, maxUses "1"). Availability starts `idle` (no hint shown for an empty code).
- **Loading:** availability `checking` → "Checking availability…" with spinner; this state disables submit.
- **Populated / available:** `available` → green (`text-emerald-400`) Check + "`<code>` is available."
- **Validation-error (client):** `invalid` → destructive X + hint "3–48 chars, lowercase letters / digits / hyphens." (disables submit). `taken` → destructive X + "`<code>` is already taken — pick another." (disables submit).
- **Validation-error (server):** action returns `{ok:false, error}` → `role="alert"` destructive banner inside the form; the form re-renders preserving client state (the code stays in the controlled input). Server error strings: "Not signed in.", "Your account isn't camp-active yet.", "Max uses must be a whole number between 1 and 100.", "Enter a valid email address.", "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.", "'<code>' is already taken.", "Couldn't save invite. Try a different code."
- **Submitting/pending:** `isPending` → submit shows spinner + "Creating…" and is disabled.
- **Success:** card swaps to `SuccessPanel` with code, copy, share/approval/uses copy, and "Send another".
- **Disabled:** submit disabled during checking/taken/invalid/pending.
- **Invite-gated:** `!hasCampAccess` → `redirect("/signup/required")` (page) / `{ok:false,"Your account isn't camp-active yet."}` (action).
- **Pending-approval / Rejected:** `!isApproved` → `redirect("/pending-approval")` (covers both `pending` and `rejected`, since neither is `approved`).
- **Onboarding-incomplete:** NOT enforced on this page — there is no `nextGate`/required-actions check here; only invite + approval gates run.
- **Captain-only-locked:** expressed in-form, not as a separate screen — captain knobs (`CaptainOptions`) render only for captains; members see the muted "needs a captain's approval" notice instead. The whole tool is reachable by both ranks.
- **Rate-limited (check API only):** 429 with `retry-after`; client treats a non-OK/thrown fetch as `idle` (no explicit "rate limited" UI; the hint just disappears).

Not applicable: offline/sync states, budget/over-target states (none in product).

## Enums, options & configurable values
- **`assignedRank`** (`AssignedRank` = `"captain" | "member"`, nullable): this surface ALWAYS inserts `null`. Captain-tier codes are CLI-only (`actions.ts:33-36, 133`). DB enum source `rankEnum = pgEnum("rank", ["captain","member"])` (`schema.ts:31`).
- **`requiresApproval`** (boolean, default false in schema): member → always `true`; captain → `!preApprove`.
- **`maxUses`** (integer, nullable in schema; this surface always sends `1`-`100`): member fixed `1`; captain `[1, 100]` integer.
- **`MAX_USES_LIMIT = 100`** (`actions.ts:28`); form input `min={1} max={100}` (`invite-form.tsx:300-301`).
- **Availability states** (client union, `invite-form.tsx:23-28`): `idle | checking | available | taken | invalid (with hint)`.
- **Check API `reason` values:** `empty | invalid | taken` (plus implicit "available" via `available:true`).
- **Debounce:** 350 ms (`invite-form.tsx:62, 86`).
- **Check rate limit:** 30 requests / 60_000 ms per user id (`check/route.ts:25-27`).
- **`generateUnusedCode` retries:** 8 (`actions.ts:147`).
- **Copy "Copied" timeout:** 1500 ms (`invite-form.tsx:356`).
- **Code syntax:** length 3-48; `/^[a-z0-9]+(-[a-z0-9]+)*$/` (`invite-words.ts:55, 58`).
- **Email pattern:** `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`actions.ts:24`).
- **Word banks:** `ADJECTIVES` (50 entries incl. a duplicate "merry") and `NOUNS` (50 entries) (`invite-words.ts:13-34`). Generator emits adjective-noun-noun.
- **`CODE_RULES_HINT`** = "3–48 chars, lowercase letters / digits / hyphens (no spaces)." (`invite-words.ts:62`).

## Data model touched
`invite_codes` table (`schema.ts:312-342`); the `createInviteAction` insert touches the following columns (must agree with unit 29):
- `code` text **PRIMARY KEY** — the invite code itself (lowercased before insert).
- `created_by_user_id` uuid → `users.id` `ON DELETE SET NULL`; set to `campUser.id` (the minter). Indexed: `invite_codes_created_by_idx`.
- `note` text — optional reason; trimmed to null if empty.
- `max_uses` integer (nullable) — `1` for members, `1`-`100` for captains. (This surface never inserts NULL; NULL would mean "unlimited" per `findUsableInviteCode`.)
- `use_count` integer NOT NULL default `0` — not set on mint; incremented at redemption (unit 03).
- `expires_at` timestamp (nullable) — NOT set by this surface (always null here).
- `revoked_at` timestamp (nullable) — NOT set here.
- `assigned_rank` `rank` enum (nullable) — ALWAYS `null` from this surface.
- `invited_email` text (nullable) — lowercased recipient email or null; `createInviteCode` re-lowercases via `input.invitedEmail?.toLowerCase()` (`invite-codes.ts:103`).
- `requires_approval` boolean NOT NULL default `false` — computed per rank/knob above.
- `created_at` timestamp NOT NULL `defaultNow()`.

`InviteCodeRow` interface mirrors these (`invite-codes.ts:7-19`) with camelCase + `createdAt: Date`. The E2E `TestInviteCode` (`test-store.ts:45-57`) has the identical shape.

Reads only (gating, not mutated here): `users` row via `ensureCampUser`/`findCampUserByAuthId` — fields read: `rank`, `inviteCode`, `approvalStatus` (`users.ts` `CampUser`). Redemption-side reads/writes of `users.invite_code`, `users.rank`, `users.approval_status` are unit 03.

## Validation, edge cases & business rules
- **Two validation passes:** client (live check, instant `isSyntacticallyValidCode`, debounced API) is a UX convenience; the action is the security boundary and re-validates everything (`actions.ts:44-46`).
- **Captain-only knobs are re-enforced server-side:** even a crafted POST with `preApprove=on` / `maxUses=50` from a member is ignored — `isCaptain` is recomputed from the DB row, and the maxUses branch only runs for captains (`actions.ts:74-93`).
- **Member invariants:** always `requiresApproval = true`, always `maxUses = 1`, email always required.
- **Captain invariants:** `requiresApproval = !preApprove`; `maxUses ∈ [1,100]`; email required only when `maxUses === 1` (`emailRequired = maxUses === 1`).
- **Email:** trimmed + lowercased; validated against `EMAIL_PATTERN` only when present; required when single-use. Multi-use captain may omit; if present, stored as "lead recipient".
- **Code uniqueness:** checked twice (form check API + action's `findInviteCodeByCode`), with the unique PK as the final backstop on insert; an insert collision (race) surfaces "Couldn't save invite. Try a different code." (`actions.ts:108-110, 137-141`).
- **Generator non-uniqueness:** `generateInviteCode` is `Math.random`-based and can collide; `generateUnusedCode` retries 8× then timestamp-suffixes. The two noun slots can repeat.
- **Client/server hint divergence (ugly truth):** the client effect hardcodes "3–48 chars, lowercase letters / digits / hyphens." while the server/API uses `CODE_RULES_HINT` "…(no spaces)." — same rule, two strings.
- **Check-endpoint test/prod existence semantics differ** — see low-confidence note in Features; in prod a revoked/expired/exhausted code still reads "taken", in E2E it reads "available".
- **No onboarding gate here:** unlike most app screens, `/tools/invite` does not check `nextGate`/required-actions; only invite + approval gates apply. An onboarding-incomplete-but-approved user could in principle reach it (edge case).
- **Submit not blocked on `idle`:** if the availability fetch errored/aborted to `idle`, submit is enabled and relies on the server check to catch a duplicate.
- **`page.tsx` uses `max-w-xl`** (not the global `max-w-lg`) — a deliberate-or-stray width deviation worth noting for a restyle.
- **Rate limiting** only protects the check oracle (per signed-in user id), preventing code enumeration; the mint action itself is not separately rate-limited here.

## Sub-components / variants
- **`InviteForm`** (default export-ish client component) — the whole tool; renders either the form or `SuccessPanel` depending on `result.ok`.
- **`AvailabilityHint`** (`invite-form.tsx:212-255`) — pure presentational hint; returns null for empty code or `idle`; renders checking/available/taken/invalid variants. Icons: `Loader2` (checking), `Check`/emerald (available), `X`/destructive (taken & invalid).
- **`CaptainOptions`** (`invite-form.tsx:257-315`) — captain-only knobs block: "Captain options" heading, pre-approve checkbox with dynamic helper copy, maxUses number input with dynamic helper copy ("Up to N people…" vs "Single-use — once someone signs up, the code is spent."). Rendered only when `isCaptain`.
- **`SuccessPanel`** (`invite-form.tsx:317-368`) — post-mint confirmation with copy + send-another.
- **Server handlers/validators/schemas:**
  - `createInviteAction` (`actions.ts`) — the mint validator + writer; `CreateInviteResult` discriminated union (`actions.ts:11-22`).
  - `generateUnusedCode` (`actions.ts:146-155`) — collision-avoiding generator wrapper (server-only helper).
  - `GET /api/tools/invite/check` (`check/route.ts`) — auth + rate-limited availability oracle.
  - `createInviteCode` / `findInviteCodeByCode` (`invite-codes.ts`) — the only two data-access functions this surface invokes (`findUsableInviteCode`/`consumeInviteCode` belong to redemption, unit 03).
  - `isSyntacticallyValidCode`, `generateInviteCode`, `CODE_RULES_HINT` (`invite-words.ts`) — shared by client, action, and API route.
- No dead/orphaned variants found in these files. (`findUsableInviteCode`/`consumeInviteCode` in `invite-codes.ts` are live but belong to redemption, not this minting surface.)
