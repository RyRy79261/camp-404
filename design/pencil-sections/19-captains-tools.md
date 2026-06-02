### 19. Captain tools hub
**Purpose:** A captain-clearance, read-only index page listing captain-only tooling as tappable cards, reached from the "Camp Tools" quadrant tile on the captain control panel.
**Layout & elements:** Mobile single column inside a `max-w-2xl` main container. Top→bottom: a ghost back button labelled "Captains" with a leading left-chevron (returns to `/`); an `<h1>` "Camp tools"; a subtitle "Captain-only tooling for running the camp."; then a list of tool cards. Each card has a bordered icon square, a title, a description, and a trailing right-chevron. The one current card: icon `Megaphone`, title "Announcements & notifications", description "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry."
**Every action (preserve all):**
- Tap a tool card → navigate to that tool's href; the whole card is the link. Today's only card → `/captains/announcements`.
- Tap "Captains" back button → navigate to `/` (home control panel).
- Keyboard focus on a card → visible focus ring. Hover on a card → subtle background change.
- No forms, inputs, or mutations on this page; it is purely a navigation index.
**States to design:**
- Populated → gated captain sees header + card list (today exactly one card).
- Empty → if the tool list were emptied, a bare list renders; no dedicated empty-state copy or placeholder exists (dead branch today).
- Loading / validation-error / submitting / success / disabled → none on this surface (server-rendered, no controls).
- Unauthenticated → redirect to `/auth/sign-in`. Invite-gated (no invite, non-god) → redirect to `/signup/required`. Pending or rejected approval (non-god) → redirect to `/pending-approval`. Non-captain rank → hard redirect to `/` (bounce home, NOT a visible locked layer). Onboarding-incomplete is NOT enforced here.
**Options & exact values:** Rank enum: "captain" | "member" (gates on "captain"). ApprovalStatus enum: "pending" | "approved" | "rejected" (passes on "approved"). Redirect targets: `/auth/sign-in`, `/signup/required`, `/pending-approval`, `/`. Metadata title: "Camp tools — Camp 404". Layout width: `max-w-2xl`. No sliders, ranges, or numeric thresholds.
**Validation & rules:**
- Strict ordered gate chain: auth → invite → approval → rank; first failure wins its redirect, later gates never run.
- God-email bypass clears invite + approval gates but NOT the rank gate (a god row defaults to "member" and is bounced home).
- Non-captains are bounced to `/`, never shown a locked view (explicit product decision).
- Tool href must point to a real built route; today's only target `/captains/announcements` exists and back-links here.
**Do-not-drop:** The exhaustive captain-only gate chain (auth → invite → approval → captain-rank, with non-captains hard-redirected home) plus the extensible tool-card list. Latent dead/orphaned branch to carry: an empty tool list renders a bare list with no empty-state placeholder.
