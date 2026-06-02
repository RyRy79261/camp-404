### 14. Invite tool (mint codes)
**Purpose:** Lets a signed-in, camp-active, approved member mint an invite code to bring a new person onto Camp 404; captains get extra pre-approve and multi-use knobs.
**Layout & elements:** Mobile single column. Ghost back-link "Tools" (→/tools). Title "Invite a member" with rank-branched description. Email field — label flips "Their email address" (required) vs "Lead recipient's email (optional)" (captain multi-use), placeholder "sara@example.com". Note Textarea (3 rows) "Why you're inviting them (optional)", placeholder "Kitchen lead from last burn; great with sourdough." Captain-only "Captain options" block: "Pre-approve whoever signs up" checkbox + "How many people can use this code" number input; members instead see muted "Anyone who signs up with this code will need a captain's approval before they can use the app." Mono code field (prefilled, generated) + Shuffle icon-button (aria "Generate a new silly code"). Live availability hint. Error alert banner. Full-width "Create invite" submit.
**Every action (preserve all):**
- Type/edit code → lowercases, triggers debounced (350ms) availability check.
- Shuffle → re-rolls a fresh code (adjective-noun-noun, e.g. "neon-toaster-mongoose").
- Enter email → required single-use, optional captain multi-use. Enter note → always optional.
- (Captain) pre-approve toggle → off=needs vetting, on=straight in. (Captain) max-uses 1–100 → >1 makes email optional + multi-use.
- Submit "Create invite" → server action; pending shows "Creating…" spinner. Disabled when pending OR availability checking/taken/invalid (NOT on idle/available).
- (Success) Copy → copies code, label flips "Copied" 1500ms. "Send another" → reloads fresh form.
**States to design:**
- Empty/initial: prefilled code, blank email/note, captain knobs default (pre-approve off, maxUses 1), availability idle (no hint).
- Loading: "Checking availability…" spinner (disables submit). Available: green check + "<code> is available."
- Validation-error client: invalid → X + "3–48 chars, lowercase letters / digits / hyphens."; taken → X + "<code> is already taken — pick another." (both disable submit).
- Validation-error server: role=alert banner — "Not signed in.", "Your account isn't camp-active yet.", "Max uses must be a whole number between 1 and 100.", "Enter a valid email address.", "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.", "'<code>' is already taken.", "Couldn't save invite. Try a different code."
- Submitting: "Creating…", disabled. Success: card swaps to "Invite ready" — "Share this code [with <email>]." + uses line ("It's single-use — once they sign up with it, nobody else can." / "Up to <N> people can sign up with it.") + approval line ("They'll need a captain's approval before they get access." / "They're pre-approved — straight in after onboarding."), mono code box, Copy, "Send another".
- Captain-only-locked: knobs render only for captains; members see muted notice. Invite-gated: !hasCampAccess → /signup/required. Pending/Rejected: !isApproved → /pending-approval.
**Options & exact values:** maxUses members fixed 1; captains 1–100 (MAX_USES_LIMIT=100, min=1 max=100). Code: length 3–48, `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Generator ~50 adjectives × ~50 nouns × ~50 nouns. Debounce 350ms. Check rate limit 30/60s per user. Generate-unused retries 8. Copy timeout 1500ms. assignedRank always null (captain-tier codes CLI-only). CODE_RULES_HINT "3–48 chars, lowercase letters / digits / hyphens (no spaces)."
**Validation & rules:**
- Client live-check is UX only; server action re-validates everything (the security boundary).
- Captain knobs re-enforced server-side; isCaptain recomputed from DB, member preApprove/maxUses ignored.
- Member invariants: requiresApproval always true, maxUses always 1, email always required. Captain: requiresApproval = !preApprove; email required only when maxUses === 1.
- Email trimmed+lowercased, validated when present. Code uniqueness checked at API + action + PK backstop; race → "Couldn't save invite. Try a different code."
- Generator can collide (Math.random, noun slots may repeat); retries 8× then timestamp-suffixes.
**Do-not-drop:** Rank-gated minting (members: single-use + required-email + vetting; captains: pre-approve + 1–100 multi-use), generated editable silly word-codes with live availability, and server-side re-validation as the real boundary. Carry over the client/server hint-string divergence and the check-endpoint test/prod existence mismatch (a dead code reads "available" in E2E but "taken" in prod).
