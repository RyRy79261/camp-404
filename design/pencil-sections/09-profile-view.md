### 9. Profile view
**Purpose:** A read-only "this is me" card for the fully-onboarded, approved camp member showing their avatar, display name, rank, and email, with three navigations out.
**Layout & elements:** Mobile single column, centered card. Top→bottom: large circular avatar (uploaded photo, else initials fallback, else "?"); `<h1>` display name; rank pill badge reading "Captain" or "Member"; email line (only when an email exists); primary "Edit profile" button (with Pencil icon); helper sentence "Want to update your burner questionnaire answers? Review them here." where "Review them here" is a link; a plain "Sign out" link (full navigation).
**Every action (preserve all):**
- Tap "Edit profile" → navigate to `/profile/edit`. Always enabled.
- Tap "Review them here" → navigate to `/onboarding/questionnaire`.
- Tap "Sign out" → hard navigation to `/auth/sign-out` (must be a real navigation, not client routing).
- No form fields, no state-mutating buttons, no async/optimistic UI — purely declarative server output.
**States to design:**
- Populated (default): avatar (photo or initials), name, rank badge, email, three navigations.
- Loading: avatar shows initials fallback until the proxied photo finishes loading; page itself is server-rendered (no spinner).
- Empty/nullable fields: no photo → initials (or "?") avatar; no display name → email (or "Burner") heading; no email → email line omitted entirely.
- Gating (page bounces, never renders these): no session → sign-in; no invite access → `/signup/required`; onboarding incomplete (no `completedAt`) → `/onboarding/questionnaire`; pending OR rejected approval → `/pending-approval`. Order: auth → invite → onboarding → approval; earliest failing gate wins.
- Validation-error / submitting / success / disabled / captain-only-locked: N/A.
**Options & exact values:** Rank badge text: "Captain" / "Member" (no "Team Lead"). Stored rank enum: `captain | member`. Approval enum: `pending | approved | rejected`. Display-name fallback chain: displayName → email → "Burner". Initials fallback: "?" when unusable. Literal copy: "Burner", "Captain", "Member", "Edit profile", "Want to update your burner questionnaire answers?", "Review them here", "Sign out".
**Validation & rules:**
- No inputs, so no field validation; all "validation" is the gate spine.
- God-account emails bypass both invite and approval gates.
- Team leads render as "Member" (no Team Lead derivation here).
- Photo visibility is approval-gated at the byte level (proxy 401s for unauthorized/unapproved, 404s in E2E/no-token) → silently falls back to initials.
**Do-not-drop:** A read-only identity card whose mere reachability proves the viewer cleared every gate (auth → invite → onboarding → approval); the avatar must degrade gracefully (photo → initials → "?") and the three exits (edit, questionnaire review, sign-out) must survive. No dead/orphaned/404 flags on this surface.
