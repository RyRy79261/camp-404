-- Custom SQL migration file, put your code below! --
-- #250: a duty card used to name its shift with a typed key (card.shiftTypeKey,
-- like "morning-clean") that no shift carried. Shift types now link to their
-- card (shift_types.duty_card_id). Link a shift type to the published duty
-- card whose key is EXACTLY the shift's name in that form ("Morning clean" ->
-- morning-clean; an underscore in a key counts as a hyphen), and only when one
-- published card has that key. Anything else stays unlinked for a lead to pick.
-- The typed key stays on the card, readable. Idempotent: a shift that already
-- has a card is never touched.
WITH cards AS (
  SELECT d.id,
         replace(lower(trim(v.card->>'shiftTypeKey')), '_', '-') AS key
  FROM documents d
  JOIN document_versions v
    ON v.document_id = d.id AND v.version = d.published_version
  WHERE d.published
    AND d.kind = 'duty_card'
    AND coalesce(trim(v.card->>'shiftTypeKey'), '') <> ''
), unique_cards AS (
  SELECT key, (array_agg(id))[1] AS id
  FROM cards
  GROUP BY key
  HAVING count(*) = 1
)
UPDATE shift_types st
SET duty_card_id = u.id
FROM unique_cards u
WHERE st.duty_card_id IS NULL
  AND u.key = trim(both '-' from regexp_replace(lower(st.name), '[^a-z0-9]+', '-', 'g'));
