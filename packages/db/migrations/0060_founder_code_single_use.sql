-- The root invite code "meowzit" is single use (owner, 2026-09-24). Setup
-- minted it with 100 uses before that ruling, and the redeem path already holds
-- it to one; this puts the stored cap in line so every reader agrees.
-- Idempotent: a row already at 1, or no row, is left alone.
UPDATE "invite_codes"
   SET "max_uses" = 1
 WHERE "code" = 'meowzit'
   AND "max_uses" IS DISTINCT FROM 1;
