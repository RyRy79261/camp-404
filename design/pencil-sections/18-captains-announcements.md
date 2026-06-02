### 18. Captain announcements composer
**Purpose:** A captain-only screen to compose, save, edit, delete, and publish camp-wide announcements, then track their delivery roll-ups.
**Layout & elements:** Single column. Back link "Camp tools" (ChevronLeft) → /captains/tools. H1 "Announcements & notifications"; lead "Compose a message, save it as a draft, then publish it to the whole camp. Everyone but you receives it. A full-screen announcement takes over each member's screen until they acknowledge it." Composer card titled "New announcement" (or "Edit draft" when editing, plus a "Cancel edit" X button): Title field (placeholder "Burn-night briefing"), Message textarea (6 rows, placeholder "What does everyone need to know?"), "How it lands" select (icon+label, with a hint line below), error banner, success notice, primary submit "Save draft"/"Update draft". "Drafts (n)" section (empty: "No drafts.") with cards: header (title + presentation pill), full body, Edit/Delete/"Publish to camp" buttons. "Published (n)" section (empty: "Nothing published yet.") with cards: header, body, footer "Sent to N member(s)", " · by you", acknowledge-only "X/Y acknowledged", timestamp.
**Every action (preserve all):**
- Type title (≤120) / message (≤5000); pick presentation → updates form + hint.
- Save/Update draft → notice "Draft saved."/"Draft updated.", reset, refresh; disabled if title or body blank, or pending.
- Cancel edit → reset to new-announcement mode.
- Edit draft → loads it into composer; Delete → "Draft deleted."; Publish → "Published to {n} member(s).".
- All mutations disable every input/button while pending; on error, show error banner, abort (no refresh).
**States to design:**
- Empty: drafts/published empty copy; composer always present.
- Loading: server-rendered, no skeleton.
- Populated: cards + section counts.
- Validation-error: blank title/body disables submit; Zod "Give it a title."/"Write the announcement." in error banner.
- Submitting: spinner on submit, all disabled.
- Success: emerald notice (suppressed if error set).
- Disabled: submit on blank/pending; row buttons on pending.
- Invite-gated → /signup/required; pending-approval/rejected → /pending-approval; non-captain → redirect home (no locked view); action errors "Captain access only." etc.
**Options & exact values:** Presentation: acknowledge (default; label "Full-screen — must acknowledge", pill "Acknowledge"), popup (label "Pop-up — dismissable", pill "Pop-up"), feed (label "Quiet — inbox only", pill "Inbox"). Title max 120; body max 5000; textarea rows 6. Scope always everyone; channel both; kind announcement.
**Validation & rules:**
- Title/body trimmed min 1, capped 120/5000.
- Drafts are author-private: edit/delete/publish only succeed on own unpublished announcement rows; else "Draft not found or already published."
- Publish fans one delivery per real member except author (system/sanitised excluded); zero recipients still succeeds at 0; idempotent (no double fan-out).
- No edit/recall/unpublish after publishing; acknowledged roll-up shown only for acknowledge.
**Do-not-drop:** Draft→edit→publish lifecycle with per-presentation delivery and the acknowledge-only roll-up; publishing is irreversible and author-private. No dead/404 flags in this unit.
