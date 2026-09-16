-- The root invite code is a fixed word in a public repo. Before this change,
-- /setup minted it unlimited and pre-approved, so anyone who read the repo
-- could sign up and join as an approved member. Owner's call (2026-09-16): keep
-- the word, but every redeemer waits for a captain's approval, and the uses are
-- capped at 100. A code that has already been used more often than that is
-- capped at its current count, so it closes instead of going negative.
--
-- Only the code the /setup wizard minted matches: no creator, its note, and no
-- cap yet. Captain-minted codes and the admin CLI's single-use founder code are
-- not touched.
UPDATE "invite_codes"
SET "requires_approval" = true,
    "max_uses" = GREATEST("use_count", 100)
WHERE "created_by_user_id" IS NULL
  AND "note" = 'Camp root invite (first-time setup)'
  AND "max_uses" IS NULL;
