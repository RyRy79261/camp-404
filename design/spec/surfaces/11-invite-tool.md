# Invite tool (mint codes) — functional brief

- **Route(s):** `/tools/invite`
- **Canonical board(s):** `S14 Invite tool` (board #23, 430×1400 px, `design/.spec-extract/boards/23-s14-invite-tool.txt`)
- **Superseded / dropped:** none — single board, no iterations. (The board's `StatesSection` and `SuccessVariant` are documentation swatches the designer parked at the bottom of the canvas, NOT additional screens — they specify the availability-hint state matrix and the success card; they collapse into the live component states, not extra layout.)
- **Breakpoints:** mobile-first 430px (board canonical size). Single vertical column; no responsive/desktop variant. The page wrapper is centred and width-capped (live code uses `max-w-xl` — see Divergences).

---

## Purpose

Lets any signed-in, camp-active, **approved** member mint an invite code from inside the app to bring a new person onto Camp 404. The redesign carries the *human-readable slug* invite (e.g. `neon-toaster-mongoose`) replacing the old `CAMP-XXXX-XXXX` placeholder format, plus an optional note, GitHub-style live availability checking, and a success card to share the code.

Two rank-scoped variants of the same surface:

- **Member variant** — single-use code, redeemer always lands in the captain vetting queue. The `CaptainOptions` block is hidden; in its place a muted member notice explains that whoever signs up needs captain approval.
- **Captain variant** — adds two extra knobs inside `CaptainOptions`: **pre-approve** (wave the redeemer straight in, skip vetting) and a **multi-use stepper** (1–100, hand one code to several people).

Every code minted here is recorded against the minter's account (`created_by_user_id`) so the family tree can attribute who brought whom. **Captain-tier (rank-promoting) codes can NOT be minted here** — this surface always inserts `assigned_rank = NULL`; promoting codes are CLI-only. This is the only safe rank boundary on the surface, and the server action recomputes it from the DB row regardless of what the client sends.

---

## Layout & modules (decomposition)

Top-to-bottom in a single 430px column. `GhostBack` header, then a `Content` column (`gap:18`, `pad:[4,16,24,16]`) holding the form. On success the whole form region is replaced by the success card.

### 1. GhostBack header (`GhostBack`)

Ghost back-link: Lucide `chevron-left` ($muted-foreground) + text "Tools" (Inter 15px/500/$muted-foreground), `pad:[14,12]`, items centre-aligned, links to `/tools`. (Board uses a lightweight ghost link, NOT the round-pill `DetailHeader` `BackBtn` — keep the ghost treatment to match the board.)

### 2. Title

T "Invite a member" (Inter 24px/700/$foreground). Single H1; no description line is drawn on the board. (The live code shows a rank-branched `CardDescription` under the title — see Divergences: keep the rank-branched description copy as it carries meaning the board omits.)

### 3. NoteField (`NoteField`)

- Label: "Why you're inviting them (optional)" (Inter 13px/500/$foreground).
- `Textarea` (`h:84`, `pad:[12,14]`, `r:$radius`, `fill:$muted`, `stroke:$border`), placeholder "Kitchen lead from last burn; great with sourdough." (Inter 14px/$muted-foreground). `name="note"`, `rows={3}`.
- Always optional, both ranks.
- **NEW (carry from live code, board omits):** the **email field** belongs in this region too. The board does not draw an email input, but the live form and reference contract both require one, and the email targets the redeemer / lead recipient. Spec it ABOVE the note (it is the primary recipient handle). See "Email field" sub-region below.

#### 3a. Email field (carried from live code — board omits)

- `name="email"`, `type="email"`, `autoComplete="off"`, placeholder `sara@example.com`.
- Label + required flip on `multiUse` (`multiUse = isCaptain && Number(maxUses) > 1`):
  - **Single-use** (member always; captain when maxUses === 1): label "Their email address", `required`.
  - **Captain multi-use:** label "Lead recipient's email (optional)", `required={false}`.

### 4. CaptainOptions (`CaptainOptions`) — captain variant ONLY

Block: `gap:14`, `pad:16`, `r:$radius`, `fill:#00dcff26` (accent tint @ ~15%), `stroke:$border`. Reconcile `#00dcff26` to a semantic accent-tint token (see Tokens decision). Rendered **only when `isCaptain`**.

- **CapHead:** Lucide `shield` ($accent) + "Captain options" (Inter 13px/700/$accent).
- **PreApprove** row (`gap:10`, centre): a checkbox (`w:20 h:20`, `r:6`, `fill:$primary`, Lucide `check` in $primary-foreground when ticked) + label "Pre-approve whoever signs up" (Inter 14px/500/$foreground). `name="preApprove"`; submits `"on"` when checked.
  - Dynamic helper copy (from live code, board omits): ticked → "They get straight in after onboarding — no captain review."; unticked → "Leave unticked and a captain must approve them before access."
- **UseCount** column (`gap:6`):
  - Label "How many people can use this code" (Inter 13px/500/$foreground).
  - `NumberInput` (`h:46`, `pad:[0,14]`, `jc:space_between`, `r:$radius`, `fill:$muted`, `stroke:$border`): current value (Inter 14px/$foreground) on the left; a `Stepper` group on the right (Lucide `minus` then `plus`, both $muted-foreground, `gap:10`). `name="maxUses"`, integer `[1,100]`.
  - **Stepper reconciliation:** the board draws an explicit −/+ stepper; the live code renders a bare `type="number"` input (`min={1} max={100}`, `w-28`). Boards win on affordance → build the stepper (−/+ buttons mutating the value), but keep the field a real `number` input under the hood for keyboard entry and the existing server validation.
  - Dynamic helper copy (live code): `maxUses > 1` → "Up to N people can sign up with this code."; else "Single-use — once someone signs up, the code is spent."

### 5. MemberNote (`MemberNote`) — member variant ONLY

Replaces `CaptainOptions` for non-captains. Row (`gap:10`, `pad:14`, `r:$radius`, `fill:$muted`): Lucide `info` ($muted-foreground) + text "Anyone who signs up with this code will need a captain's approval before they can use the app." (Inter 13px/normal/$muted-foreground).

> **Member-variant rule (per surface guidance):** `CaptainOptions` is hidden; `MemberNote` shown. Exactly one of {CaptainOptions, MemberNote} renders, branched on `isCaptain`.

### 6. CodeField (`CodeField`)

- Label "Invite code" (Inter 13px/500/$foreground).
- **CodeRow** (`gap:10`, centre): `CodeInput` (`h:46`, `pad:[0,14]`, `r:$radius`, `fill:$muted`, `stroke:$border`) holding the slug in **JetBrains Mono** 14px/$foreground (mono is the brand data-console face for invite slugs — codify); + `ShuffleBtn` (`w:46 h:46` square, `r:$radius`, `fill:$muted`, `stroke:$border`, Lucide `shuffle` $foreground), aria-label "Generate a new silly code".
  - `name="code"`, controlled, seeded once via `generateInviteCode()`. `onChange` lowercases input. `spellCheck={false}`, `autoComplete="off"`. Shuffle re-rolls a fresh generated code.
- **AvailHint** (`AvailabilityHint`): live availability line under the row — see States for the full matrix.

### 7. CreateBtn (`<Button-Primary>` instance)

Full-width primary button, label "Create invite". Disabled while `isPending || availability ∈ {checking, taken, invalid}`. (Notably NOT disabled in `idle` or `available` — server is the backstop.) While pending: label "Creating…" + Lucide `Loader2` spinner, `op:0.7`.

### 8. SuccessCard (`SuccessPanel`) — replaces the whole form on success

Card (`gap:12`, `pad:20`, `r:$radius`, `fill:$card`, `stroke:$border`):

- **Head:** Lucide `circle-check` (success green) + "Invite ready" (Inter 17px/700/$foreground).
- Body line: "Share this code with whoever you're inviting." — live code composes this dynamically: `"Share this code with <email>. "` (if email) else `"Share this code. "`, then a uses line + an approval line (see States → Success).
- **Meta** rows (`gap:6`):
  - Lucide `users` ($muted-foreground) + uses line ("Can be used by N person/people." / single-use phrasing).
  - Lucide `shield-check` ($muted-foreground) + approval line ("They'll be pre-approved — no captain sign-off needed." / "They'll need a captain's approval…").
- **CodeBox:** `h:50`, `pad:[0,16]`, centred, `r:$radius`, `fill:$muted`, `stroke:$border`, slug in **JetBrains Mono** 16px/500/$foreground.
- **Actions** (`gap:10`): `<Button-Primary>` "Copy" (full-width; copies to clipboard, label flips "Copied" for 1500 ms) + `<Button-Outline>` "Send another" (full-width; links `/tools/invite`, full reload resets the form).

---

## Components used (reusable + new)

| Component | Source | Role | Key props / variants |
|---|---|---|---|
| `Button-Primary` | canvas reusable → `@camp404/ui` `Button` (variant="default") | CreateBtn + success Copy | `className="w-full"`; CreateBtn `type="submit"`, disabled per availability/pending, label "Create invite" ↔ "Creating…" (+`Loader2`), `op:0.7` pending |
| `Button-Outline` | canvas reusable → `@camp404/ui` `Button` (variant="outline") | Shuffle icon-button + success "Send another" | Shuffle: `size="icon"`, aria-label "Generate a new silly code", Lucide `Shuffle`. Send-another: `asChild` wrapping `<a href="/tools/invite">`, `w-full` |
| `Card` / `CardHeader` / `CardContent` / `CardTitle` / `CardDescription` | `@camp404/ui` `card` | Form wrapper + SuccessCard wrapper | live code wraps the whole form in a `Card`; board draws the form un-carded but cards the success state — reconcile to a consistent card treatment (see Open questions) |
| `Input` | `@camp404/ui` `input` | Email field, code field, (number under stepper) | code field `className="font-mono"` (JetBrains Mono); number `min={1} max={100}` |
| `Textarea` | `@camp404/ui` `textarea` | Note field | `rows={3}` |
| `Checkbox` | `@camp404/ui` `checkbox` | Pre-approve toggle (captain) | `name="preApprove"`, controlled |
| `Label` | `@camp404/ui` `label` | Field labels | `htmlFor` per field |
| `AvailabilityHint` | **new** (inline, `invite-form.tsx`) | Live availability line | props: `availability` union, `code`; returns null for empty/idle |
| `CaptainOptions` | **new** (inline, `invite-form.tsx`) | Captain-only knobs block | props: `preApprove`, `onPreApproveChange`, `maxUses`, `onMaxUsesChange`; render-gated on `isCaptain` |
| `Stepper` | **new** (inline sub-control of `CaptainOptions`) | −/+ adjust maxUses | −/+ icon buttons mutating the number value, clamp `[1,100]` |
| `SuccessPanel` | **new** (inline, `invite-form.tsx`) | Post-mint confirmation | props: `code`, `email`, `maxUses`, `requiresApproval` |
| `InviteForm` | **new** (client component, `invite-form.tsx`) | Whole tool | prop `isCaptain` (the sole rank input the client sees) |

Lucide icons used: `chevron-left`, `shield`, `check`, `minus`, `plus`, `info`, `shuffle`, `circle-check`, `circle-x`, `loader-2`, `x`, `users`, `shield-check`, `copy`, `mail` (tools-hub entry only).

**Not used:** `TopChrome`, `DetailHeader` (board uses a ghost link, not the pill header), `EmptyState`, `CaptainLock`. (No preview-but-locked gating applies here — see States; this tool is reachable by both ranks and gates by rank *in-form*, not via `CaptainLock`.)

---

## States — full matrix

### Global rows that apply

- **Empty / initial:** form pre-filled with a freshly `generateInviteCode()`'d slug; email + note blank; captain knobs default (pre-approve OFF, maxUses "1"). Availability `idle` → no hint rendered for a non-empty seeded code only after first check resolves; on initial mount the seeded code triggers a check immediately.
- **Loading (availability checking):** Lucide `Loader2` spinner + "Checking availability…" (Inter/$muted-foreground). Disables CreateBtn.
- **Populated / available:** Lucide `circle-check` (success green, board `#3fd07a`) + "`<code>` is available." (success-green text). CreateBtn enabled.
- **Validation-error (client, availability):**
  - `invalid` → Lucide `circle-x` ($destructive) + "3–48 chars, lowercase letters / digits / hyphens." Disables CreateBtn.
  - `taken` → Lucide `circle-x` ($destructive) + "`<code>` is already taken — pick another." Disables CreateBtn.
- **Validation-error (server):** action returns `{ok:false, error}` → `role="alert"` destructive-tinted banner inside the form (`border-destructive/40`, `bg-destructive/10`, $destructive text); client state preserved (typed code stays). Server error strings: "Not signed in.", "Your account isn't camp-active yet.", "Max uses must be a whole number between 1 and 100.", "Enter a valid email address.", "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.", "'<code>' is already taken.", "Couldn't save invite. Try a different code."
- **Submitting / pending:** CreateBtn → `Loader2` + "Creating…", disabled, `op:0.7`.
- **Success:** form region swaps to `SuccessCard`. Composed copy:
  - share line: `email` present → "Share this code with <email>. " else "Share this code. "
  - uses line: `maxUses === 1` → "It's single-use — once they sign up with it, nobody else can." / "Can be used by 1 person." (Meta row); else "Up to N people can sign up with it." / "Can be used by N people." (Meta row).
  - approval line: `requiresApproval` → " They'll need a captain's approval before they get access." / Meta "…will need a captain's approval…"; else " They're pre-approved — straight in after onboarding." / Meta "They'll be pre-approved — no captain sign-off needed."
- **Disabled:** CreateBtn disabled during checking / taken / invalid / pending.

### Availability union (client state machine)

`idle | checking | available | taken | invalid (with hint)`. Empty code or `idle` → no hint rendered. Drives both the hint UI and the CreateBtn disabled set.

### Rank / variant states

- **Member variant:** `CaptainOptions` hidden; `MemberNote` shown; email always required; effective `maxUses = 1`, `requiresApproval = true` (server-enforced regardless of any crafted POST).
- **Captain variant:** `CaptainOptions` shown; `MemberNote` hidden; email required only when single-use.

### Gating states (entry)

- **Invite-gated:** `!hasCampAccess(campUser, primaryEmail)` → page `redirect("/signup/required")`; action returns `{ok:false,"Your account isn't camp-active yet."}`.
- **Pending / rejected approval:** `!isApproved(...)` → page `redirect("/pending-approval")` (covers both `pending` and `rejected`, since neither is `approved`).
- **Onboarding-incomplete:** NOT enforced here — no `nextGate`/required-actions check on this page (only invite + approval gates). Flag as a build reconciliation: an approved-but-onboarding-incomplete user could reach the tool.
- **Preview-but-locked (`CaptainLock`):** NOT applicable. The tool is reachable by both ranks and resolves rank gating *in-form* (`CaptainOptions` vs `MemberNote`), not via the shared `CaptainLock` lock surface. (Decision #3's preview-but-locked treatment applies to captain-only *data* surfaces; this surface intentionally serves both ranks with no hidden data.)

### Rate-limited (check oracle only)

`GET /api/tools/invite/check` is rate-limited (30 req / 60 s per user id) → 429 with `retry-after`. The client treats any non-OK/thrown fetch as `idle` (the hint simply disappears) — no explicit "rate limited" UI.

### Not applicable

Offline/sync, budget/over-target — none in product.

---

## User actions — each action → result

| Action | Result |
|---|---|
| Type / edit the code | input lowercases on change → fires the debounced (350 ms) availability check |
| Tap Shuffle (`ShuffleBtn`) | re-rolls a fresh `generateInviteCode()` slug into the field → re-checks availability |
| Enter recipient email | required for single-use; optional ("lead recipient") for captain multi-use |
| Enter a note | always optional |
| (Captain) tick "Pre-approve whoever signs up" | sets `requiresApproval = false`; helper copy updates |
| (Captain) adjust the use stepper (−/+) | mutates `maxUses` in `[1,100]`; flips `multiUse`, which flips the email label/required; helper copy updates |
| Tap "Create invite" | runs `createInviteAction`; on `ok` → SuccessCard; on `!ok` → server error banner |
| (Success) tap "Copy" | `navigator.clipboard.writeText(code)`; label → "Copied" for 1500 ms |
| (Success) tap "Send another" | navigate `/tools/invite` (full reload → fresh form) |
| Tap ghost "Tools" back | navigate `/tools` |

---

## Data & enums — mapped to schema.ts

`invite_codes` table (`packages/db/src/schema.ts:312-342`). **No schema change** — every column this surface touches already exists. The mint insert (`createInviteCode`) writes:

| Column (schema) | Type | This surface writes |
|---|---|---|
| `code` | text **PRIMARY KEY** | the slug, trimmed + lowercased |
| `created_by_user_id` | uuid → `users.id` ON DELETE SET NULL (idx `invite_codes_created_by_idx`) | `campUser.id` (the minter) |
| `note` | text (nullable) | trimmed note or `null` |
| `max_uses` | integer (nullable) | member: `1`; captain: `[1,100]`. (Never `NULL` here; `NULL` = "unlimited" per `findUsableInviteCode`.) |
| `use_count` | integer NOT NULL default 0 | NOT set on mint (incremented at redemption — unit 03) |
| `expires_at` | timestamp (nullable) | NOT set (always `null` here) |
| `revoked_at` | timestamp (nullable) | NOT set here |
| `assigned_rank` | `rank` enum (nullable) | **ALWAYS `null`** — captain-tier codes are CLI-only |
| `invited_email` | text (nullable) | lowercased recipient email or `null` (re-lowercased in `createInviteCode`) |
| `requires_approval` | boolean NOT NULL default false | member → always `true`; captain → `!preApprove` |
| `created_at` | timestamp NOT NULL defaultNow() | DB default |

**Enums / configurable values:**

- `rankEnum = pgEnum("rank", ["captain","member"])` (`schema.ts:31`) — `assigned_rank` always `NULL` here; `AssignedRank` derived as nullable.
- Client availability union: `idle | checking | available | taken | invalid` — NEW (UI-only, not persisted).
- Check API `reason`: `empty | invalid | taken` (+ implicit available via `available:true`) — NEW (transport-only).
- `MAX_USES_LIMIT = 100` (`actions.ts`); form `min={1} max={100}`.
- Debounce 350 ms; check rate limit 30 req / 60 s per user id; `generateUnusedCode` 8 retries; Copy "Copied" timeout 1500 ms.
- Code syntax: length 3–48, `CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/`.
- Email pattern: `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

**Reads only (gating, not mutated here):** `users` row via `ensureCampUser` — fields `rank`, `inviteCode`, `approvalStatus`. Redemption-side writes are unit 03.

**NEW vs existing:** nothing NEW in the DB. The slug format, note, multi-use, pre-approve, and `invited_email` are all already supported — this is **app-layer only** (consistent with decisions.md "Invite" reconciliation).

---

## Validation & edge cases

- **Two-pass validation:** client (instant `isSyntacticallyValidCode` + debounced API) is UX convenience only; `createInviteAction` is the security boundary and re-validates everything from scratch.
- **Slug rule (3–48 chars, lowercase letters/digits/hyphens):** single hyphens between segments, no spaces, no leading/trailing hyphen (`CODE_PATTERN`). Enforced client-side (live hint) and server-side (action).
- **Captain-only knobs re-enforced server-side:** `isCaptain` is recomputed from the DB row; a crafted POST with `preApprove=on` / `maxUses=50` from a member is ignored (the maxUses branch only runs for captains; `preApprove` is `isCaptain && ...`). Member invariants hold no matter what.
- **Member invariants:** always `requiresApproval=true`, always `maxUses=1`, email always required.
- **Captain invariants:** `requiresApproval = !preApprove`; `maxUses ∈ [1,100]` integer; email required only when `maxUses === 1`.
- **Email:** trimmed + lowercased; validated against `EMAIL_PATTERN` only when present; required when single-use; captain multi-use may omit (stored as "lead recipient" if present).
- **Code uniqueness:** checked twice (check API + action `findInviteCodeByCode`), with the unique PK as the final backstop on insert; a race → "Couldn't save invite. Try a different code."
- **Generator non-uniqueness (ugly truth):** `generateInviteCode` is `Math.random`-based and can collide (the two noun slots can even repeat, e.g. `neon-yak-yak`); `generateUnusedCode` retries 8× then appends a `Date.now().toString(36)` suffix.
- **Client / server hint-string divergence (ugly truth):** client effect hardcodes "3–48 chars, lowercase letters / digits / hyphens." while the API/server uses `CODE_RULES_HINT` "…(no spaces)." — same rule, two strings. Reconcile to one constant.
- **Check-endpoint test/prod existence mismatch (ugly truth, low-confidence flag from reference):** in prod `findInviteCodeByCode` matches ANY row (revoked/expired/exhausted included) so a dead code reads "taken"; in E2E mode `testStore.findUsableInviteCode` excludes those, so the same dead code reads "available". Behavioural inconsistency to settle when wiring the check route.
- **Submit not blocked on `idle`:** if the availability fetch errored/aborted to `idle`, CreateBtn stays enabled and relies on the server's `findInviteCodeByCode` to catch a duplicate.
- **Stale tools-hub copy:** the Tools-hub entry (`S13`) says "Mint a single-use code…" — stale for captains (who can mint multi-use). Fix the hub copy as part of this redesign (decisions.md "Invite" note).
- **Mint action is not separately rate-limited** — only the check oracle is. Acceptable (mint is auth+approval gated and writes one PK row).

---

## Flows

**Entry:** Tools hub (`/tools`) → "Invite a member" card → `/tools/invite`. Page runs auth → `ensureCampUser` → invite gate → approval gate. Fail invite gate → `/signup/required`; fail approval gate → `/pending-approval`. Pass → render `InviteForm` with `isCaptain`.

**Member happy path:** seeded slug auto-checks → "available" → enter recipient email (required) → optional note → "Create invite" → server validates → SuccessCard (single-use, requires-approval copy) → Copy / Send another.

**Captain happy path:** seeded slug → optionally tick Pre-approve and/or raise the use stepper → (email required only if single-use) → "Create invite" → SuccessCard reflects chosen uses + approval state.

**Re-roll / edit:** Shuffle or manual edit → debounced check → available/taken/invalid hint gates the submit button.

**Exit:** SuccessCard "Send another" → fresh `/tools/invite`; ghost back → `/tools`.

---

## Divergences from feature-set reference — and resolution

| Divergence | Resolution (per locked decisions / boards-win) |
|---|---|
| Board omits the **email field**; reference + live code require it | **Keep the email field** (boards-win on layout, but never drop functionality the reference implies). Place it in the recipient region with the rank-/multi-use-dependent label + required flip. |
| Board omits the rank-branched **title description**; live code has distinct captain vs member copy | Keep the rank-branched description — it conveys vetting/family-tree meaning the board's bare title omits. |
| Board draws a **−/+ stepper**; live code uses a bare `type="number"` input | Boards win on affordance → build the stepper UI, but back it with a real number input + the existing `[1,100]` integer server validation (don't lose keyboard entry or the validation). |
| Board cards only the **success** state (form drawn un-carded); live code cards the whole form | Reconcile to a consistent card treatment; recommend carding both (matches live code + `Card` reusable). Flagged in Open questions. |
| Raw hex tints (`#00dcff26` accent tint, `#3fd07a` success green) | Reconcile to semantic tokens per decisions.md Tokens note: add `success` status token for the green; map the accent tint to an accent-tint token. |
| Reference notes `assignedRank` could be set | **Locked:** captain-tier codes are CLI-only; this surface ALWAYS inserts `assigned_rank = NULL`. |
| decisions.md "Invite": `invite_codes` already supports everything → app-layer only | Confirmed — **no schema change**. Also fix the stale Tools-hub "single-use" copy and the S03 gate `CAMP-XXXX-XXXX` placeholder to the slug format. |
| JetBrains Mono on the slug | Keep — codify mono as the brand data-console face for invite slugs (decisions.md #2). |

---

## Open questions / build reconciliations

1. **Card treatment consistency** — board cards only the success state; live code cards the whole form. Pick one (recommend card both) and update the board or the build accordingly.
2. **Onboarding gate** — this page skips the `nextGate`/required-actions check that most app surfaces run. Confirm whether an approved-but-onboarding-incomplete user should be allowed to mint (currently they can).
3. **Hint-string single source** — collapse the two divergent rules-hint strings (client hardcode vs `CODE_RULES_HINT`) into one shared constant.
4. **Check-route prod/test existence semantics** — settle whether availability should consider revoked/expired/exhausted codes as "taken" consistently across prod and E2E.
5. **`max-w-xl` vs global `max-w-lg`** — the page uses a wider container than the app default; confirm intentional or normalise.
6. **Status tokens** — `success` (and accent-tint) tokens are not yet in `globals.css`; add them so the availability "available" green and the `CaptainOptions` tint stop using raw hex.
7. **Stale Tools-hub + S03 copy** — update the hub card description (drop "single-use") and the invite-gate placeholder to the slug format as part of shipping this redesign.
