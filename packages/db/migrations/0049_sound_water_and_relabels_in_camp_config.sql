-- Custom SQL migration file, put your code below! ---- The owner's final team list (2026-09-24). Water, Sound, Power and Lighting
-- and Safety are separate teams, and Sanitation and MOOP is a different team
-- from Water. 0048 added the `sound` and `water` enum values and the new-camp
-- default; this brings a camp that already exists up to the same list.
--
-- 1. Relabel three teams whose key stays (Postgres cannot drop an enum value,
--    and the members on them stay where they are):
--      sanitation_and_water   "Sanitation and Water"  -> "Sanitation and MOOP"
--      health_and_safety      "Health and Safety"     -> "Safety"
--      communications_and_hr  "Communications and HR" -> "Communications & HR"
--    Only an entry whose label is still the old default changes. A label a
--    captain chose is kept, and the entry's order and archived flag are kept
--    either way.
-- 2. Append Sound, then Water, after the camp's last team, each only when it is
--    not there yet, the way 0045 appended the teams before them.
--
-- Every statement matches nothing once it has run, so a re-run changes
-- nothing. A config with no team list, or an empty one, reads as the code
-- default (which already has all of this) and is left alone, or it would
-- become these two teams alone. Nothing here casts to the "team" enum: the
-- config is JSONB, and Postgres refuses a new enum value inside the
-- transaction that added it.
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN t ->> 'key' = 'sanitation_and_water'
          AND t ->> 'label' = 'Sanitation and Water'
          THEN jsonb_set(t, '{label}', to_jsonb('Sanitation and MOOP'::text))
        WHEN t ->> 'key' = 'health_and_safety'
          AND t ->> 'label' = 'Health and Safety'
          THEN jsonb_set(t, '{label}', to_jsonb('Safety'::text))
        WHEN t ->> 'key' = 'communications_and_hr'
          AND t ->> 'label' = 'Communications and HR'
          THEN jsonb_set(t, '{label}', to_jsonb('Communications & HR'::text))
        ELSE t
      END
      ORDER BY i
    )
    FROM jsonb_array_elements("config" -> 'teams') WITH ORDINALITY AS e(t, i)
  )
)
WHERE jsonb_typeof("config" -> 'teams') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("config" -> 'teams') AS t
    WHERE (t ->> 'key' = 'sanitation_and_water' AND t ->> 'label' = 'Sanitation and Water')
       OR (t ->> 'key' = 'health_and_safety' AND t ->> 'label' = 'Health and Safety')
       OR (t ->> 'key' = 'communications_and_hr' AND t ->> 'label' = 'Communications and HR')
  );
--> statement-breakpoint
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  ("config" -> 'teams') || jsonb_build_array(jsonb_build_object(
    'key', 'sound',
    'label', 'Sound',
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
    WHERE t ->> 'key' = 'sound'
  );
--> statement-breakpoint
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  ("config" -> 'teams') || jsonb_build_array(jsonb_build_object(
    'key', 'water',
    'label', 'Water',
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
    WHERE t ->> 'key' = 'water'
  );
