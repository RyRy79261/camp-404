### 6. Pending / rejected approval gate
**Purpose:** A terminal blocking screen that holds an authenticated, invited, onboarded member out of the app until a captain approves or rejects them.
**Layout & elements:** Centred single-column card (no Back button, no footer, no app navigation). Top→bottom: a circular status-icon badge (pending = Clock icon; rejected = ShieldX icon); a bold heading ("Application submitted" when pending, "Application not approved" when rejected); body copy below. Pending body: "Thanks{, displayName} — your profile is in. A captain needs to approve your access before you can use the rest of the app. We'll let you in as soon as they do; just check back here." (name appended only when a display name exists). Rejected body: "A captain has reviewed your application and it wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you." Full-width outline-style "Sign out" button at the bottom — the only interactive control. Page/browser-tab title: "Application pending — Camp 404".
**Every action (preserve all):**
- Tap "Sign out" → navigates to the hosted sign-out flow. Always enabled.
- Reload page ("just check back here") → re-runs all gates; if a captain approved → redirect to home; if rejected → re-renders with rejected copy. No polling/auto-refresh.
- No appeal/retry/resubmit affordance exists for a rejected user.
- Implicit on-load redirects (not user-initiated): no invite → /signup/required; already approved → / (home); onboarding incomplete → /onboarding/questionnaire; unauthenticated → /auth/sign-in.
**States to design:**
- Loading: server-rendered, arrives complete; no skeleton/spinner.
- Populated — Pending: Clock icon, "Application submitted", personalised thanks copy.
- Populated — Rejected: ShieldX icon, "Application not approved", terminal copy.
- Success: represented by absence (redirect to home; user never sees this page again).
- Invite-gated: missing invite → redirect to /signup/required (never lingers here).
- Onboarding-incomplete: profile not completed → redirect to /onboarding/questionnaire.
- Empty / validation-error / submitting / disabled: n/a (no list, no form, no toggleable controls).
**Options & exact values:** approvalStatus ∈ "pending" | "approved" | "rejected" (default "approved"; only this screen shows pending/rejected). Button label: "Sign out". Captain decisions accept only "approved" | "rejected". Rank ∈ "captain" | "member" (gate keys on approval, not rank). No timeouts, expiry, or polling interval.
**Validation & rules:**
- Re-validates the full upstream gate chain on every request, in order: auth → invite → already-approved → onboarding-complete → then branch pending vs rejected.
- Auto-clears: once approved, the next load redirects home (no client refresh needed); god accounts are always approved and never see this page.
- Rejected is terminal for the user: only a captain re-deciding or sign-out changes state.
**Do-not-drop:** A hard dead-end with zero app navigation expressing two distinct terminal states (pending vs rejected), exactly one escape (Sign out), and a captain-driven exit that auto-unlocks the app on next load. No dead/orphaned states; both branches are live.
