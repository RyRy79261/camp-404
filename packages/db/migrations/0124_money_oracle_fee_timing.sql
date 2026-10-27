-- Camp fees (owner, 2026-10-27). Andrew's published builder questionnaire
-- "camp-fees-the-money-oracle" asks when each member can pay their camp fee,
-- the same question as the pledge's "by when". This gives his question
-- (q_27b642d9) the fee_timing role, so a submit writes dues_accounts.pay_by:
--  - its options option_1..option_6 become the six fixed FEE_TIMINGS values,
--    in that order (labels kept), and "Other" is turned off, in the head
--    definition and every published version;
--  - a show-when condition on it is mapped the same way;
--  - each stored answer is mapped the same way;
--  - each finished answer fills the member's pay_by for that year, where it is
--    still empty.
-- Idempotent (a second run maps nothing new and fills nothing set), and it
-- changes nothing when the questionnaire is absent or its options are not
-- exactly option_1..option_6 (or already the six timings).

CREATE OR REPLACE FUNCTION camp404_mo_value(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE v
    WHEN 'option_1' THEN 'all_by_end_nov'
    WHEN 'option_2' THEN 'all_by_end_dec'
    WHEN 'option_3' THEN 'part_by_end_nov'
    WHEN 'option_4' THEN 'part_by_end_dec'
    WHEN 'option_5' THEN 'all_by_15_jan'
    WHEN 'option_6' THEN 'talk_to_captain'
    ELSE v
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION camp404_mo_options_ok(opts jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(opts) = 'array'
    AND jsonb_array_length(opts) = 6
    AND (
      SELECT count(DISTINCT camp404_mo_value(o->>'value'))
      FROM jsonb_array_elements(opts) AS o
      WHERE camp404_mo_value(o->>'value') IN (
        'all_by_end_nov', 'all_by_end_dec', 'part_by_end_nov',
        'part_by_end_dec', 'all_by_15_jan', 'talk_to_captain'
      )
    ) = 6
$$;
--> statement-breakpoint
-- Whether a definition holds his question with options this migration knows
-- (option_1..option_6, or already the six timings). Nothing else is touched.
CREATE OR REPLACE FUNCTION camp404_mo_fits(def jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    camp404_mo_options_ok(
      jsonb_path_query_first(
        def,
        '$.** ? (@.id == "q_27b642d9" && @.kind == "single_select")'
      ) -> 'options'
    ),
    false
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION camp404_mo_walk(j jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  out jsonb;
BEGIN
  IF jsonb_typeof(j) = 'object' THEN
    -- The question itself.
    IF j->>'id' = 'q_27b642d9' AND j->>'kind' = 'single_select' THEN
      IF NOT camp404_mo_options_ok(j->'options') THEN
        RETURN j;
      END IF;
      SELECT jsonb_agg(
               jsonb_set(o, '{value}', to_jsonb(camp404_mo_value(o->>'value')))
               ORDER BY i
             )
        INTO out
        FROM jsonb_array_elements(j->'options') WITH ORDINALITY AS t(o, i);
      RETURN (j - 'allowOther' - 'otherLabel')
        || jsonb_build_object('role', 'fee_timing', 'options', out);
    END IF;
    -- A show-when condition on it.
    IF j->>'fieldId' = 'q_27b642d9' AND j ? 'value' THEN
      IF jsonb_typeof(j->'value') = 'string' THEN
        j := jsonb_set(j, '{value}', to_jsonb(camp404_mo_value(j->>'value')));
      ELSIF jsonb_typeof(j->'value') = 'array' THEN
        SELECT coalesce(jsonb_agg(
                 CASE WHEN jsonb_typeof(e) = 'string'
                   THEN to_jsonb(camp404_mo_value(e #>> '{}'))
                   ELSE e END
                 ORDER BY i
               ), '[]'::jsonb)
          INTO out
          FROM jsonb_array_elements(j->'value') WITH ORDINALITY AS t(e, i);
        j := jsonb_set(j, '{value}', out);
      END IF;
      RETURN j;
    END IF;
    out := '{}'::jsonb;
    FOR k, v IN SELECT * FROM jsonb_each(j) LOOP
      out := out || jsonb_build_object(k, camp404_mo_walk(v));
    END LOOP;
    RETURN out;
  ELSIF jsonb_typeof(j) = 'array' THEN
    SELECT coalesce(jsonb_agg(camp404_mo_walk(e) ORDER BY i), '[]'::jsonb)
      INTO out
      FROM jsonb_array_elements(j) WITH ORDINALITY AS t(e, i);
    RETURN out;
  END IF;
  RETURN j;
END
$$;
--> statement-breakpoint
-- Map the stored answers first, while the definition still says which
-- options are Andrew's (a definition whose options do not fit is left alone,
-- and so are its answers).
UPDATE "questionnaire_responses" AS r
SET "responses" = jsonb_set(
      r."responses",
      '{q_27b642d9}',
      to_jsonb(camp404_mo_value(r."responses"->>'q_27b642d9'))
    )
WHERE r."definition_key" = 'camp-fees-the-money-oracle'
  AND r."responses"->>'q_27b642d9' IN (
    'option_1', 'option_2', 'option_3', 'option_4', 'option_5', 'option_6'
  )
  AND EXISTS (
    SELECT 1 FROM "questionnaire_definitions" AS d
    WHERE d."key" = r."definition_key"
      AND camp404_mo_fits(d."definition")
  );
--> statement-breakpoint
UPDATE "questionnaire_versions"
SET "definition" = camp404_mo_walk("definition")
WHERE "definition_key" = 'camp-fees-the-money-oracle'
  AND camp404_mo_fits("definition")
  AND camp404_mo_walk("definition") <> "definition";
--> statement-breakpoint
UPDATE "questionnaire_definitions"
SET "definition" = camp404_mo_walk("definition"),
    "updated_at" = now()
WHERE "key" = 'camp-fees-the-money-oracle'
  AND camp404_mo_fits("definition")
  AND camp404_mo_walk("definition") <> "definition";
--> statement-breakpoint
-- Each finished answer is the member's "by when" for that year, unless they
-- already have one.
INSERT INTO "dues_accounts" ("user_id", "cycle", "pay_by")
SELECT r."user_id", r."cycle", (r."responses"->>'q_27b642d9')::"fee_timing"
FROM "questionnaire_responses" AS r
JOIN "users" AS u ON u."id" = r."user_id"
WHERE r."definition_key" = 'camp-fees-the-money-oracle'
  AND r."completed_at" IS NOT NULL
  AND u."sanitised" = false
  AND r."responses"->>'q_27b642d9' IN (
    'all_by_end_nov', 'all_by_end_dec', 'part_by_end_nov',
    'part_by_end_dec', 'all_by_15_jan', 'talk_to_captain'
  )
ON CONFLICT ("user_id", "cycle") DO UPDATE
SET "pay_by" = EXCLUDED."pay_by", "updated_at" = now()
WHERE "dues_accounts"."pay_by" IS NULL;
--> statement-breakpoint
DROP FUNCTION camp404_mo_walk(jsonb);
--> statement-breakpoint
DROP FUNCTION camp404_mo_fits(jsonb);
--> statement-breakpoint
DROP FUNCTION camp404_mo_options_ok(jsonb);
--> statement-breakpoint
DROP FUNCTION camp404_mo_value(text);
