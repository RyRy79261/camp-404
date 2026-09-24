-- Custom SQL migration file, put your code below! --
-- Money is kept in ZAR, USD or EUR (#237), and 0047 adds a CHECK constraint
-- that holds each money table to those three codes. Postgres checks every
-- stored row when that constraint is added, so the stored codes are cleaned
-- here first. Until now a claim took any three letters and a budget any three
-- capitals, so a row may say ' zar', 'usd', 'R' or 'Euro'.
--
-- Each table gets three steps:
--   1. trim and upper-case the code, so ' zar' becomes 'ZAR';
--   2. map the spellings whose meaning is not in doubt: R / RAND / RANDS to
--      ZAR, $ / US$ / US DOLLAR / DOLLAR / DOLLARS to USD, and € / EURO /
--      EUROS to EUR;
--   3. stop if anything else is left.
-- Step 3 raises an exception, which fails the deploy's migration step and rolls
-- back every pending migration with it. The app never guesses what someone paid
-- in: a code this cannot map needs a mapping added in a new migration.
--
-- Every UPDATE touches only rows whose code changes, so a re-run changes
-- nothing. updated_at is left alone: the amount and what was paid have not
-- changed, only how the code is spelled.
UPDATE "payments"
SET "currency" = upper(btrim("currency"))
WHERE "currency" <> upper(btrim("currency"));
--> statement-breakpoint
UPDATE "payments"
SET "currency" = CASE
  WHEN upper(btrim("currency")) IN ('R', 'RAND', 'RANDS') THEN 'ZAR'
  WHEN upper(btrim("currency")) IN ('$', 'US$', 'US DOLLAR', 'DOLLAR', 'DOLLARS') THEN 'USD'
  WHEN upper(btrim("currency")) IN ('€', 'EURO', 'EUROS') THEN 'EUR'
  ELSE "currency"
END
WHERE upper(btrim("currency")) IN (
  'R', 'RAND', 'RANDS',
  '$', 'US$', 'US DOLLAR', 'DOLLAR', 'DOLLARS',
  '€', 'EURO', 'EUROS'
);
--> statement-breakpoint
UPDATE "reimbursements"
SET "currency" = upper(btrim("currency"))
WHERE "currency" <> upper(btrim("currency"));
--> statement-breakpoint
UPDATE "reimbursements"
SET "currency" = CASE
  WHEN upper(btrim("currency")) IN ('R', 'RAND', 'RANDS') THEN 'ZAR'
  WHEN upper(btrim("currency")) IN ('$', 'US$', 'US DOLLAR', 'DOLLAR', 'DOLLARS') THEN 'USD'
  WHEN upper(btrim("currency")) IN ('€', 'EURO', 'EUROS') THEN 'EUR'
  ELSE "currency"
END
WHERE upper(btrim("currency")) IN (
  'R', 'RAND', 'RANDS',
  '$', 'US$', 'US DOLLAR', 'DOLLAR', 'DOLLARS',
  '€', 'EURO', 'EUROS'
);
--> statement-breakpoint
UPDATE "team_budgets"
SET "currency" = upper(btrim("currency"))
WHERE "currency" <> upper(btrim("currency"));
--> statement-breakpoint
UPDATE "team_budgets"
SET "currency" = CASE
  WHEN upper(btrim("currency")) IN ('R', 'RAND', 'RANDS') THEN 'ZAR'
  WHEN upper(btrim("currency")) IN ('$', 'US$', 'US DOLLAR', 'DOLLAR', 'DOLLARS') THEN 'USD'
  WHEN upper(btrim("currency")) IN ('€', 'EURO', 'EUROS') THEN 'EUR'
  ELSE "currency"
END
WHERE upper(btrim("currency")) IN (
  'R', 'RAND', 'RANDS',
  '$', 'US$', 'US DOLLAR', 'DOLLAR', 'DOLLARS',
  '€', 'EURO', 'EUROS'
);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "payments" WHERE "currency" NOT IN ('ZAR', 'USD', 'EUR')
  ) THEN
    RAISE EXCEPTION 'currency cleanup: payments holds a code other than ZAR, USD or EUR; add a mapping in a new migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "reimbursements" WHERE "currency" NOT IN ('ZAR', 'USD', 'EUR')
  ) THEN
    RAISE EXCEPTION 'currency cleanup: reimbursements holds a code other than ZAR, USD or EUR; add a mapping in a new migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "team_budgets" WHERE "currency" NOT IN ('ZAR', 'USD', 'EUR')
  ) THEN
    RAISE EXCEPTION 'currency cleanup: team_budgets holds a code other than ZAR, USD or EUR; add a mapping in a new migration';
  END IF;
END
$$;
