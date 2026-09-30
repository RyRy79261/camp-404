-- Logistics phases on the camp calendar get plain titles ("Build", not
-- "Transport and Logistics Team - Build") and lose the team tag (owner,
-- 2026-09-30: every phase is a whole-camp event). A phase already on the
-- calendar was written with the old title, so it is marked as not matching
-- the calendar any more. The app's calendar catch-up (on a page load, no
-- cron) then writes it again under the SAME event id it already owns: the
-- event is updated in place, never duplicated. Idempotent: running it again
-- only asks for one more rewrite.
UPDATE "logistics_phases"
SET "calendar_synced_version" = NULL
WHERE "calendar_event_id" IS NOT NULL;
