-- Give every existing member their payment reference (C404-M001, C404-M002,
-- ...) in the order they joined, so references go out on deploy with no
-- operator step. The system account and erased accounts get none. Numbering
-- starts after any reference already given. Members who join later get the
-- next number the first time they need one (ensureMemberRefCode in
-- @camp404/db/payments).
WITH "taken" AS (
  SELECT coalesce(max(substring("ref_code" FROM '^C404-M([0-9]+)$')::int), 0) AS "max"
  FROM "users"
),
"numbered" AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "created_at", "id") AS "n"
  FROM "users"
  WHERE "is_system" = false AND "sanitised" = false AND "ref_code" IS NULL
)
UPDATE "users"
SET "ref_code" = 'C404-M' || lpad(("taken"."max" + "numbered"."n")::text, 3, '0')
FROM "numbered", "taken"
WHERE "users"."id" = "numbered"."id";
