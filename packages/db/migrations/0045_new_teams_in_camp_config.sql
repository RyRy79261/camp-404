-- Custom SQL migration file, put your code below! --
-- Transport and Logistics, Communications and HR and Mutant Vehicle join the
-- live team list (#236). 0044 added the enum values and the column default;
-- this appends each team to the config a camp already has, after its last
-- team, in that order. Each statement runs once per camp and only when its team
-- is not there yet, so a re-run changes nothing and a captain's label or archive
-- on an entry that exists is kept. A config with no team list, or an empty one,
-- falls back to the code default, which has all three; it is left alone, or it
-- would become these teams alone.
--
-- Nothing here casts the new keys to the "team" enum: drizzle runs pending
-- migrations in one transaction, and Postgres refuses a new enum value inside
-- the transaction that added it. The config is JSONB, so it never touches it.
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  ("config" -> 'teams') || jsonb_build_array(jsonb_build_object(
    'key', 'transport_and_logistics',
    'label', 'Transport and Logistics',
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
    WHERE t ->> 'key' = 'transport_and_logistics'
  );
--> statement-breakpoint
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  ("config" -> 'teams') || jsonb_build_array(jsonb_build_object(
    'key', 'communications_and_hr',
    'label', 'Communications and HR',
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
    WHERE t ->> 'key' = 'communications_and_hr'
  );
--> statement-breakpoint
UPDATE "camp_settings"
SET "config" = jsonb_set(
  "config",
  '{teams}',
  ("config" -> 'teams') || jsonb_build_array(jsonb_build_object(
    'key', 'mutant_vehicle',
    'label', 'Mutant Vehicle',
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
    WHERE t ->> 'key' = 'mutant_vehicle'
  );
