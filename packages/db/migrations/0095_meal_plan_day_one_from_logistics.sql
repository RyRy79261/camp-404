-- Custom SQL migration file, put your code below! --
-- The meal plan takes its Day 1 from Logistics (the owner, 2026-10-03): the
-- first Build day, else the first Burn day. Until now it kept a date of its
-- own (kitchen_meal_plans.first_day), and the Kitchen's prep steps and their
-- tasks were dated from it. Where Logistics gives a different Day 1, every
-- prep step moves by the same days, its task's due date with it, and the
-- task's line of detail ("For Day 3 breakfast, Sat 24 Apr") when nobody has
-- edited it, as the app does when Day 1 moves (redatePrepSteps). The plates
-- and the menu stay on their day numbers.
--
-- One statement, so the three updates read the same rows. Idempotent: it
-- sets first_day to the Day 1 Logistics gives, so a second run finds nothing
-- to move. A year with no Build or Burn days keeps its prep steps' dates.
WITH "moves" AS (
  SELECT p."cycle", p."first_day" AS "old_day", d."new_day",
         (d."new_day" - p."first_day") AS "shift"
  FROM "kitchen_meal_plans" AS p
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT l."start_date" FROM "logistics_phases" AS l
        WHERE l."cycle" = p."cycle" AND l."phase" = 'build'
          AND l."start_date" IS NOT NULL AND l."end_date" IS NOT NULL),
      (SELECT l."start_date" FROM "logistics_phases" AS l
        WHERE l."cycle" = p."cycle" AND l."phase" = 'burn'
          AND l."start_date" IS NOT NULL AND l."end_date" IS NOT NULL)
    ) AS "new_day"
  ) AS d
  WHERE p."first_day" IS NOT NULL
    AND d."new_day" IS NOT NULL
    AND d."new_day" <> p."first_day"
),
"moved_tasks" AS (
  UPDATE "tasks" AS t
  SET "due_at" = t."due_at" + make_interval(days => m."shift"),
      "description" = CASE
        WHEN t."description" = 'For Day ' || i."day" || ' '
          || (CASE WHEN i."meal" = 'breakfast' THEN 'breakfast' ELSE 'dinner' END)
          || ', ' || to_char(m."old_day" + (i."day" - 1), 'Dy') || ' '
          || to_char(m."old_day" + (i."day" - 1), 'FMDD') || ' '
          || (CASE WHEN extract(month FROM m."old_day" + (i."day" - 1)) = 9
                THEN 'Sept' ELSE to_char(m."old_day" + (i."day" - 1), 'Mon') END)
        THEN 'For Day ' || i."day" || ' '
          || (CASE WHEN i."meal" = 'breakfast' THEN 'breakfast' ELSE 'dinner' END)
          || ', ' || to_char(m."new_day" + (i."day" - 1), 'Dy') || ' '
          || to_char(m."new_day" + (i."day" - 1), 'FMDD') || ' '
          || (CASE WHEN extract(month FROM m."new_day" + (i."day" - 1)) = 9
                THEN 'Sept' ELSE to_char(m."new_day" + (i."day" - 1), 'Mon') END)
        ELSE t."description"
      END,
      "version" = t."version" + 1
  FROM "kitchen_prep_steps" AS s
  JOIN "kitchen_menu_items" AS i ON i."id" = s."menu_item_id"
  JOIN "moves" AS m ON m."cycle" = s."cycle"
  WHERE t."id" = s."task_id" AND t."status" <> 'cancelled'
  RETURNING t."id"
),
"moved_steps" AS (
  UPDATE "kitchen_prep_steps" AS s
  SET "due_date" = s."due_date" + m."shift"
  FROM "moves" AS m
  WHERE m."cycle" = s."cycle"
  RETURNING s."id"
)
UPDATE "kitchen_meal_plans" AS p
SET "first_day" = m."new_day"
FROM "moves" AS m
WHERE p."cycle" = m."cycle";
