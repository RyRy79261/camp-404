-- The fuel can register (#255, owner 2026-10-02): a can is numbered by its
-- place on the printed sheet, so its name goes. A name someone typed (not the
-- automatic "Can 3") is kept as the can's note, so nothing they wrote is lost.
-- Every other new field starts empty: owner (null is the camp), material
-- (null shows as not said) and car (null is not on a car yet). Idempotent: a
-- can that already has a note is left alone.
UPDATE "fuel_cans"
SET "note" = left(btrim("label"), 80)
WHERE "note" IS NULL
  AND btrim("label") <> ''
  AND btrim("label") !~ '^Can [0-9]+$';
