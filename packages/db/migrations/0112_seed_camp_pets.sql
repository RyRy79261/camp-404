-- Custom SQL migration file, put your code below! --
-- The camp's four cats, as pets that are already in (owner, 2026-10-09).
--
-- Jinn is Caitlin's, Moda and Nipster are Michael's, Prince is Cloud's. Each
-- wears the picture the code already has for it (@camp404/games/pets), has no
-- photos (it was never sent) and no hint yet. Its "stupid thing" is a neutral
-- placeholder for its owner to change.
--
-- The owner is linked only when exactly ONE member goes by that first name
-- (the first word of their display name, any case), leaving out erased
-- "Lost Cat" accounts. None or several, and the owner stays empty for a
-- founder to set in the app.
--
-- Safe to run again: a pet whose picture key is already worn is skipped
-- (pets_module_key_uniq), so nothing is added twice and a founder's later
-- changes stay.
INSERT INTO "pets" ("owner_id", "name", "kind", "stupid_thing", "status", "module_key")
SELECT
  (
    SELECT CASE WHEN count(*) = 1 THEN min(u."id"::text)::uuid END
    FROM "users" u
    WHERE u."sanitised" = false
      AND lower((regexp_split_to_array(btrim(coalesce(u."display_name", '')), '\s+'))[1]) = lower(v.owner_first)
  ),
  v.name,
  'cat',
  'Still thinking of one.',
  'in',
  v.module_key
FROM (
  VALUES
    ('jinn', 'Jinn', 'Caitlin'),
    ('moda', 'Moda', 'Michael'),
    ('nipster', 'Nipster', 'Michael'),
    ('prince', 'Prince', 'Cloud')
) AS v(module_key, name, owner_first)
ON CONFLICT ("module_key") DO NOTHING;
