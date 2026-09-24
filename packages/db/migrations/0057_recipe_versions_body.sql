-- Kitchen redo (#243): every recipe version holds the whole recipe as one
-- body in Noble Notations' shape (KitchenRecipe in @camp404/types), and every
-- version has its own plate count in recipe_plate_counts. This converts the
-- versions the first draft wrote, from their method text and their
-- recipe_version_ingredients rows, which stay in place unused because preview
-- deployments share the production database.
--
-- Idempotent: only versions whose body is still NULL are converted, and a
-- plate-count row is added only where the version has none.
--
-- The amounts: the first draft stored an amount per serving, so a line's
-- quantity is that times the version's plates, to one decimal. A unit of
-- `each` becomes `piece`. A category outside the shopping list's becomes
-- `other`. The same ingredient twice in one version (the old shape allowed
-- it) gets a component ("Part 2") so the two lines stay apart. The method's
-- numbered lines become steps with no phase and no uses; a version with no
-- method gets one step pointing at the original.
UPDATE "recipe_versions" AS v
SET "body" = jsonb_build_object(
  'title', left(coalesce(nullif(btrim(r."title"), ''), 'Untitled recipe'), 120),
  'summary', NULL,
  'plates', least(greatest(v."servings_basis", 1), 500),
  'totalTimeMinutes', NULL,
  'activeTimeMinutes', NULL,
  'ingredients', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'component', CASE WHEN x.rn > 1 THEN 'Part ' || x.rn ELSE NULL END,
      'name', left(btrim(x."name"), 200),
      'category', CASE
        WHEN x."category" IN ('produce', 'protein', 'dairy', 'fungus', 'herb',
          'grain', 'legume', 'spice', 'condiment', 'fat', 'acid', 'sweetener',
          'liquid', 'alcohol', 'additive', 'other')
          THEN x."category"
        ELSE 'other'
      END,
      'quantity', least(
        round((x."quantity_per_serving" * least(greatest(v."servings_basis", 1), 500))::numeric, 1),
        100000
      ),
      'quantityMax', NULL,
      'unit', CASE x."unit"::text WHEN 'each' THEN 'piece' ELSE x."unit"::text END,
      'preparation', left(nullif(btrim(x."prep_note"), ''), 200),
      'note', left(nullif(btrim(x."conversion_note"), ''), 500),
      'optional', x."optional"
    ) ORDER BY x."position")
    FROM (
      SELECT vi."position", vi."quantity_per_serving", vi."unit", vi."prep_note",
        vi."conversion_note", vi."optional", i."name", i."category",
        row_number() OVER (PARTITION BY lower(i."name") ORDER BY vi."position") AS rn
      FROM "recipe_version_ingredients" AS vi
      JOIN "ingredients" AS i ON i."id" = vi."ingredient_id"
      WHERE vi."version_id" = v."id"
    ) AS x
  ), '[]'::jsonb),
  'steps', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'phase', NULL,
      'instruction', left(s.line, 600),
      'uses', '[]'::jsonb,
      'durationMinutes', NULL,
      'durationMaxMinutes', NULL,
      'temperatureC', NULL,
      'equipment', '[]'::jsonb,
      'note', NULL
    ) ORDER BY s.n)
    FROM (
      SELECT btrim(regexp_replace(t.line, '^\s*\d+\.\s*', '')) AS line, t.n
      FROM regexp_split_to_table(coalesce(v."method", ''), '\r?\n')
        WITH ORDINALITY AS t(line, n)
    ) AS s
    WHERE s.line <> ''
  ), jsonb_build_array(jsonb_build_object(
    'phase', NULL,
    'instruction', 'See the original recipe.',
    'uses', '[]'::jsonb,
    'durationMinutes', NULL,
    'durationMaxMinutes', NULL,
    'temperatureC', NULL,
    'equipment', '[]'::jsonb,
    'note', NULL
  ))),
  'notes', '[]'::jsonb
)
FROM "recipes" AS r
WHERE r."id" = v."recipe_id"
  AND v."body" IS NULL;
--> statement-breakpoint
-- Each version's own plate count, the one the shopping list (#245) reads when
-- a day cooks the recipe as written.
INSERT INTO "recipe_plate_counts" ("version_id", "plates", "lines", "notes", "source")
SELECT v."id",
  (v."body" ->> 'plates')::integer,
  coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'name', l ->> 'name',
      'quantity', l -> 'quantity',
      'quantityMax', l -> 'quantityMax',
      'unit', l -> 'unit',
      'note', NULL
    ) ORDER BY e.o)
    FROM jsonb_array_elements(v."body" -> 'ingredients') WITH ORDINALITY AS e(l, o)
  ), '[]'::jsonb),
  '[]'::jsonb,
  'version'
FROM "recipe_versions" AS v
WHERE v."body" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "recipe_plate_counts" AS pc WHERE pc."version_id" = v."id"
  )
ON CONFLICT ("version_id", "plates") DO NOTHING;
