-- Events made before an event had an audience: one with a team is that
-- team's. Idempotent: only rows still on the column's default.
UPDATE "camp_events" SET "audience" = 'team' WHERE "team" IS NOT NULL AND "audience" = 'camp';
