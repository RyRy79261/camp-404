-- Custom SQL migration file, put your code below! --
-- Money is in South African rands only (owner's call, 2026-09-24:
-- "Everything should be in South African rands."). 0051 replaces the three
-- CHECK constraints 0047 added (ZAR, USD or EUR) with currency = 'ZAR'.
--
-- A stored USD or EUR row cannot be made ZAR safely: relabelling it would turn
-- dollars into the same number of rands, and converting it needs a rate
-- nobody recorded. So this does not touch a single row. It stops the deploy
-- with a clear error if any money table holds a row in another currency, and
-- the error rolls back every pending migration with it (drizzle runs them in
-- one transaction). Settling such a row is a decision for the owner, shipped
-- as a migration of its own before this one can run.
--
-- It reads and writes nothing else, so a re-run changes nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "payments" WHERE "currency" <> 'ZAR') THEN
    RAISE EXCEPTION 'rands only: payments holds a row in a currency other than ZAR. Money is not converted automatically; settle that row in a new migration, then deploy again.';
  END IF;
  IF EXISTS (SELECT 1 FROM "reimbursements" WHERE "currency" <> 'ZAR') THEN
    RAISE EXCEPTION 'rands only: reimbursements holds a row in a currency other than ZAR. Money is not converted automatically; settle that row in a new migration, then deploy again.';
  END IF;
  IF EXISTS (SELECT 1 FROM "team_budgets" WHERE "currency" <> 'ZAR') THEN
    RAISE EXCEPTION 'rands only: team_budgets holds a row in a currency other than ZAR. Money is not converted automatically; settle that row in a new migration, then deploy again.';
  END IF;
END
$$;
