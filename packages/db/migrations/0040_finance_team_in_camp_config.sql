-- Custom SQL migration file, put your code below! --
-- Finance joins the live team list (owner, 2026-09-23: "we need a finance
-- team"). 0039 added the enum value and the column default; this appends the
-- team to the config a camp already has, after its last team. It runs once per
-- camp and only when Finance is not there yet, so a re-run changes nothing. A
-- config with no team list, or an empty one, falls back to the code default,
-- which has Finance; it is left alone, or it would become Finance alone.
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  ("config" -> 'teams') || jsonb_build_array(jsonb_build_object(
    'key', 'finance',
    'label', 'Finance',
    'order', (
      SELECT coalesce(max((t ->> 'order')::int), -1) + 1
      FROM jsonb_array_elements("config" -> 'teams') AS t
    ),
    'archived', false
  ))
)
WHERE jsonb_typeof("config" -> 'teams') = 'array'
  AND jsonb_array_length("config" -> 'teams') > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("config" -> 'teams') AS t
    WHERE t ->> 'key' = 'finance'
  );
