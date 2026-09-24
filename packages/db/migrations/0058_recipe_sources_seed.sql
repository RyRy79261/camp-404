-- Kitchen source editor (#243): every recipe with pasted text gets version 1
-- of its source, so the editor opens on the text the member wrote and a send
-- has a source to read. The whole text goes into Steps, one paragraph per
-- non-blank line in order; ingredients, equipment and notes start as an empty
-- document. Serves is left NULL: the text may say it, but nothing here reads
-- it. The author is the text's author, so the member's consent tick still
-- decides whether their unchanged words may go to Claude.
--
-- Idempotent: a recipe that already has a source is skipped, and ON CONFLICT
-- keeps a second run from writing a duplicate version 1.
INSERT INTO "recipe_sources"
  ("recipe_id", "version", "serves", "ingredients", "equipment", "steps", "notes", "author_id")
SELECT
  r."id",
  1,
  NULL,
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  jsonb_build_object(
    'type', 'doc',
    'content', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object(
            'type', 'text',
            'text', regexp_replace(l."line", '^\s+|\s+$', '', 'g')
          ))
        )
        ORDER BY l."n"
      )
      FROM regexp_split_to_table(r."raw_text", E'\r?\n') WITH ORDINALITY AS l("line", "n")
      WHERE l."line" ~ '\S'
    ), '[{"type":"paragraph"}]'::jsonb)
  ),
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  r."text_author_id"
FROM "recipes" r
WHERE r."raw_text" ~ '\S'
  AND NOT EXISTS (
    SELECT 1 FROM "recipe_sources" s WHERE s."recipe_id" = r."id"
  )
ON CONFLICT DO NOTHING;
