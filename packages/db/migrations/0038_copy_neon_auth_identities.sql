-- Copy every sign-in identity out of the managed Neon Auth schema into the
-- self-hosted Better Auth tables made by 0037 (owner's call, 2026-09-22: leave
-- Neon Auth for self-hosted Better Auth, keep the database).
--
-- WHAT MOVES, AND WHY IT IS SAFE
--   * Every neon_auth."user" row with an email becomes a public."user" row
--     WITH THE SAME ID. users.auth_user_id already holds that id, so every camp
--     member stays linked to their login without rewriting a single camp row.
--   * Every neon_auth.account row of a copied user: the `credential` row keeps
--     its password hash, so a member's existing password keeps working as long
--     as Neon hashed it the way Better Auth does (both are Better Auth). If it
--     does not verify, "Forgot your password?" sets a new one. A `google` row
--     keeps its Google account id, so Google sign-in lands on the same person.
--     OAuth tokens are NOT copied: they belong to Neon's Google client.
--   * Sessions are NOT copied. Everyone signs in once after the deploy.
--
-- WHY IT READS THE SHAPE FIRST
--   Neon owns neon_auth, and this repository never declared most of its
--   columns. A migration that names a column Neon does not have would fail the
--   deploy. So each optional column is read only if information_schema says it
--   exists, and a database with no neon_auth at all (local, PGlite, a fresh
--   branch) copies nothing and says so.
--
-- Idempotent: ON CONFLICT DO NOTHING on both inserts, so a re-run is a no-op.

DO $$
DECLARE
  users_copied integer := 0;
  accounts_copied integer := 0;
  name_expr text;
  verified_expr text;
  image_expr text;
  user_created_expr text;
  user_updated_expr text;
  password_expr text;
  scope_expr text;
  account_created_expr text;
  account_updated_expr text;
BEGIN
  IF to_regclass('neon_auth."user"') IS NULL THEN
    RAISE NOTICE '0038: neon_auth."user" does not exist, nothing to copy';
    RETURN;
  END IF;

  name_expr := CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'name')
    THEN 'coalesce(nullif(btrim(u.name), ''''), lower(btrim(u.email)))'
    ELSE 'lower(btrim(u.email))' END;
  verified_expr := CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'emailVerified')
    THEN 'coalesce(u."emailVerified", false)'
    ELSE 'false' END;
  image_expr := CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'image')
    THEN 'u.image'
    ELSE 'NULL' END;
  user_created_expr := CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'createdAt')
    THEN 'coalesce(u."createdAt"::timestamp, now())'
    ELSE 'now()' END;
  user_updated_expr := CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'updatedAt')
    THEN 'coalesce(u."updatedAt"::timestamp, now())'
    ELSE 'now()' END;

  EXECUTE format($q$
    INSERT INTO public."user" (id, name, email, email_verified, image, created_at, updated_at)
    SELECT u.id::text, %s, lower(btrim(u.email)), %s, %s, %s, %s
    FROM neon_auth."user" u
    WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    ON CONFLICT DO NOTHING
  $q$, name_expr, verified_expr, image_expr, user_created_expr, user_updated_expr);
  GET DIAGNOSTICS users_copied = ROW_COUNT;

  IF to_regclass('neon_auth.account') IS NOT NULL AND (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'neon_auth' AND table_name = 'account'
      AND column_name IN ('id', 'accountId', 'providerId', 'userId')
  ) = 4 THEN
    password_expr := CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neon_auth' AND table_name = 'account' AND column_name = 'password')
      THEN 'a.password'
      ELSE 'NULL' END;
    scope_expr := CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neon_auth' AND table_name = 'account' AND column_name = 'scope')
      THEN 'a.scope'
      ELSE 'NULL' END;
    account_created_expr := CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neon_auth' AND table_name = 'account' AND column_name = 'createdAt')
      THEN 'coalesce(a."createdAt"::timestamp, now())'
      ELSE 'now()' END;
    account_updated_expr := CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neon_auth' AND table_name = 'account' AND column_name = 'updatedAt')
      THEN 'coalesce(a."updatedAt"::timestamp, now())'
      ELSE 'now()' END;

    EXECUTE format($q$
      INSERT INTO public.account (id, account_id, provider_id, user_id, password, scope, created_at, updated_at)
      SELECT a.id::text, a."accountId"::text, a."providerId"::text, a."userId"::text, %s, %s, %s, %s
      FROM neon_auth.account a
      JOIN public."user" pu ON pu.id = a."userId"::text
      ON CONFLICT DO NOTHING
    $q$, password_expr, scope_expr, account_created_expr, account_updated_expr);
    GET DIAGNOSTICS accounts_copied = ROW_COUNT;
  ELSE
    RAISE NOTICE '0038: neon_auth.account is missing or unrecognised, no sign-in methods copied';
  END IF;

  RAISE NOTICE '0038: copied % identities and % sign-in methods from neon_auth', users_copied, accounts_copied;
END $$;
