### 3. Invite gate
**Purpose:** A post-auth redemption screen where a signed-in user without an invite code on file enters one to become a camp member, gated before the questionnaire/approval flow.
**Layout & elements:** Mobile single column inside the centred `AuthShell` card (Back button hidden), footer "Camp 404 is invite-only." Top→bottom: heading "One more thing"; body copy — when signed in, "You're signed in as <email>. Camp 404 is invite-only — drop your code below to come aboard." (only the second sentence when no email); label "Invite code" above a single text input (`name="code"`; autocomplete/spellcheck/autocapitalize/autocorrect off; required); inline error region (`role="alert"`, destructive styling); full-width submit button "Enter camp"; a "Sign out" link.
**Every action (preserve all):**
- Type code → fills the required text field.
- Submit "Enter camp" → posts to redeem; on success redirects home; button disabled while pending (label flips to "Checking…").
- Failure → inline `role="alert"` error shows; user stays on the gate.
- "Sign out" link → GET /auth/sign-out; the gate's exit.
**States to design:**
- Empty — input blank on first render, no error.
- Populated — code typed in.
- Submitting — pending; button disabled, label "Checking…".
- Validation-error — error text shown: "Please enter an invite code." / "That invite code isn't valid." / "Too many attempts — wait a few minutes and try again."
- Success — redirect to home (no in-form success UI).
- Disabled — submit disabled while pending.
- Already-has-access / god email — page bounces to home; gate never renders.
- Pending/rejected — NOT shown here; downstream after redemption.
**Options & exact values:** Assigned rank: "captain" | "member" (null = default member). Approval status set here: "pending" or "approved" ("rejected" never set here). Rate limit: 10 attempts per 10 minutes per user. Env config: GOD_EMAILS (bypass gate), INVITE_CODES (unlimited bootstrap codes).
**Validation & rules:**
- Code trimmed; empty → "Please enter an invite code."
- Invalid/expired/revoked/exhausted/race-loser → "That invite code isn't valid."
- Over rate limit → "Too many attempts…"; required attribute blocks empty client submit.
- Env codes checked first (no rank/approval/consume); DB codes atomically consume one use; approval only tightens, never un-approves except into the pending queue.
- Re-entry/god email idempotent: returns ok without re-stamping; visiting gate persists no orphan row.
**Do-not-drop:** The single surface that validates and atomically consumes an invite code to stamp camp membership (inviteCode, optional rank, optional pending-approval) — must keep a working exit (Sign out). Dead within unit: `findUsableInviteCode`, `findInviteCodeByCode`, `createInviteCode`, `testStore.seedInviteCode` are not part of this redemption path.
