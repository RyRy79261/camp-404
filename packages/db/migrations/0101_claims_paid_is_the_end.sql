-- Paid is the end of a claim (owner, 2026-10-05): the "reconciled" step is
-- gone. Any claim marked reconciled is paid, so it goes back to paid before
-- the next migration takes the value out of reimbursement_status (that
-- migration's cast would fail on a row still holding it). Idempotent: a
-- second run finds no reconciled row. paid_at was stamped when the claim was
-- paid; a row without one takes the time it was reconciled.
UPDATE "reimbursements"
SET "status" = 'paid',
    "paid_at" = COALESCE("paid_at", "reconciled_at", "updated_at")
WHERE "status" = 'reconciled';
