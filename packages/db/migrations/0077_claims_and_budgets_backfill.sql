-- Custom SQL migration file, put your code below! --
-- Team budgets and claims (#242) keep money in whole rand cents. 0076 added
-- the cents columns beside the old decimal ones; this fills them from the old
-- ones, and 0078 (generated) makes a claim's amount required and drops the
-- decimal columns. drizzle runs pending migrations in one transaction, so if
-- anything here fails, nothing is changed.
--
-- The tables were written only through the Claude connector and are expected
-- to be empty, but a stored row is converted, never lost:
--   * a claim's amount becomes its cents (12.34 -> 1234);
--   * a budget's amount is the old "assigned" amount (the owner ruled one
--     budget per team, 2026-09-30); a row with only a "perceived" amount keeps
--     that one instead, so no figure someone typed disappears;
--   * a claim written before the camp named its year keeps the sentinel year
--     and setFoundingYear adopts it; on a camp that has a year, it moves into
--     the camp's current year, the one currentCycle() picks (as 0034 did).
--
-- Each UPDATE touches only rows whose cents are still empty (or whose year is
-- still the sentinel), so a re-run changes nothing.
UPDATE "reimbursements"
SET "amount_cents" = round("amount" * 100)::integer
WHERE "amount_cents" IS NULL;
--> statement-breakpoint
UPDATE "team_budgets"
SET "amount_cents" = round(COALESCE("assigned_amount", "perceived_amount") * 100)::integer
WHERE "amount_cents" IS NULL
  AND COALESCE("assigned_amount", "perceived_amount") IS NOT NULL;
--> statement-breakpoint
WITH cycles AS (
  SELECT (c->>'year')::int AS year, c->>'endedAt' AS ended_at
  FROM camp_settings, jsonb_array_elements(
    CASE WHEN jsonb_typeof(config->'cycles') = 'array' THEN config->'cycles' ELSE '[]'::jsonb END
  ) AS c
  WHERE c->>'year' ~ '^[0-9]{4}$'
), current_year AS (
  SELECT COALESCE(
    (SELECT min(year) FROM cycles WHERE ended_at IS NULL HAVING count(*) = 1),
    (SELECT max(year) FROM cycles)
  ) AS year
)
UPDATE "reimbursements" SET "cycle" = current_year.year
FROM current_year
WHERE current_year.year IS NOT NULL AND "reimbursements"."cycle" = 1;
