-- Invite codes have one spelling: lowercase (normalizeInviteCode in
-- @camp404/core). Redemption now lowercases what the member types, so a code
-- stored with capitals, minted by the admin CLI before it lowercased too, could
-- never be redeemed again. Lowercase those codes.
--
-- A code whose lowercase twin already exists is left as it is: the primary key
-- forbids the rename, and silently merging two codes would merge their use
-- counts and inviters.
UPDATE "invite_codes" AS c
SET "code" = lower(c."code")
WHERE c."code" <> lower(c."code")
  AND NOT EXISTS (
    SELECT 1 FROM "invite_codes" AS twin WHERE twin."code" = lower(c."code")
  );
--> statement-breakpoint
-- A member's recorded code follows it. Only a code that no longer exists as
-- spelled is lowercased: one renamed above, or an env-list code, which has no
-- row at all.
UPDATE "users" AS u
SET "invite_code" = lower(u."invite_code")
WHERE u."invite_code" <> lower(u."invite_code")
  AND NOT EXISTS (
    SELECT 1 FROM "invite_codes" AS c WHERE c."code" = u."invite_code"
  );
