### 10. Profile edit + delete account
**Purpose:** A signed-in, approved member's self-service surface to edit their display name and profile photo, plus a Danger-zone account deletion that anonymises (not hard-deletes) the account into a "Lost Cat #N" stub.
**Layout & elements:** Mobile single column. Header "Edit profile" + subtext "Update your photo and how your name shows up around camp." Card 1 (Edit profile): large circular avatar uploader (no photo → dashed circle + camera icon + "Add photo"; text button cycles "Upload a photo" / "Uploading…" / "Change photo"; destructive "X" remove overlay when a photo shows); label "Display name" with text input; error banner (role="alert"); footer ghost "Cancel" + submit "Save changes". Card 2 (Danger zone): heading "Danger zone"; copy "This permanently erases your personal data and removes you from camp rosters. Your account becomes an anonymous "Lost Cat" stub so the family tree stays intact — it can't be undone. Type DELETE to confirm."; label "Confirmation" + input (placeholder "DELETE"); error banner; destructive submit "Delete my account".
**Every action (preserve all):**
- Edit display name → updates field; disabled while saving.
- Upload/change photo → file picker → browser crop/resize → upload → preview swaps in; triggers disabled + spinner while uploading.
- Remove photo (X, only when photo shown and not uploading) → clears preview; persists null on save.
- Save changes → updateProfile → on success redirect to /profile; disabled while saving.
- Cancel → link to /profile (discards unsaved photo/name changes).
- Delete account → requires exact "DELETE" → deleteOwnAccount → on success redirect to /auth/sign-out; disabled while deleting.
**States to design:**
- Empty: name shows display name or email fallback or ""; avatar empty placeholder; confirm empty.
- Populated: server-rendered values (no skeleton).
- Submitting: name + buttons disabled, "Saving…"; delete button "Deleting…"; avatar "Uploading…" with spinner overlay.
- Validation-error: inline role="alert" banners.
- Success: redirect only (no in-page banner).
- Gating (page-level redirects): unauthenticated → /auth/sign-in; no invite → /signup/required; onboarding incomplete → /onboarding/questionnaire; pending/rejected → /pending-approval.
**Options & exact values:** Display name maxLength 80 (MAX_NAME_LENGTH=80). Confirmation literal "DELETE" (case-sensitive, no trim). Avatar: max 5 MB, image-only, crop/resize 512px WebP quality 0.85. Anonymised name "Lost Cat #N". No rank UI.
**Validation & rules:**
- Display name trimmed; empty → "Display name can't be empty."; >80 → "Display name must be 80 characters or fewer."
- Empty photo string normalises to null; photo persists only on save (two-phase).
- Wrong/absent confirm → "Type DELETE to confirm."
- Avatar upload failure → server error or "Upload failed".
- Delete is irreversible: row anonymised, personal child rows purged, bank PII scrubbed; id + invite lineage kept; re-login becomes a fresh access-less user.
**Do-not-drop:** Self-service name/photo edit AND a confirm-gated, irreversible anonymising "Lost Cat #N" deletion that preserves referral lineage and audit FKs. Carry-over flag: action-vs-page gating asymmetry — server actions re-gate only on auth+invite (not onboarding/approval), so a since-pending/rejected member could still POST edits/delete.
