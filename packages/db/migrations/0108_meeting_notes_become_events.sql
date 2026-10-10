-- Custom SQL migration file, put your code below! --
-- Every meeting note becomes a meeting on the camp calendar (owner,
-- 2026-10-10, ruling 2A: "Meetings is a type of calendar item"). The
-- Meetings program goes away; a meeting is now an event in the Calendar, with
-- its agenda and minutes in meeting_notes, linked by the event's Google id
-- (meeting_notes.calendar_event_id).
--
-- 1. A note that names no calendar event gets a camp_events row of its own: a
--    meeting on its day, at its time, one hour long (to 23:59 at the latest),
--    with its team and title, in its year, written by whoever wrote the note.
--    The row claims a new Google id (base32hex, as the app makes them) and
--    the note is linked to it. calendar_synced_version stays null, so the
--    calendar catch-up on the next page load puts it on the camp's Google
--    Calendar (production only). No one has to do anything.
-- 2. Two notes that name the SAME Google event: the oldest keeps it; each
--    later one gets its own meeting event, as in 1, so no note's minutes are
--    lost or merged. (One event now holds one note: 0109 makes the link
--    unique.)
--
-- held_at is stored as UTC; camp time is UTC+2 all year (Johannesburg has no
-- daylight saving), the rule the app uses (meetingInstant).
--
-- Re-running it changes nothing: every note names an event after the first
-- run, and no event is named twice.

UPDATE "meeting_notes" n
SET "calendar_event_id" = NULL
WHERE n."calendar_event_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "meeting_notes" o
    WHERE o."calendar_event_id" = n."calendar_event_id"
      AND (o."created_at", o."id") < (n."created_at", n."id")
  );--> statement-breakpoint

WITH picked AS (
  SELECT
    "id",
    replace(gen_random_uuid()::text, '-', '') AS event_id,
    LEAST("held_at" + interval '2 hours',
          date_trunc('day', "held_at" + interval '2 hours') + interval '23 hours 58 minutes') AS local_at
  FROM "meeting_notes"
  WHERE "calendar_event_id" IS NULL
), linked AS (
  UPDATE "meeting_notes" n
  SET "calendar_event_id" = p.event_id
  FROM picked p
  WHERE n."id" = p."id" AND n."calendar_event_id" IS NULL
  RETURNING n."cycle", n."team", n."title", n."created_by_user_id",
            n."updated_by_user_id", p.event_id, p.local_at
)
INSERT INTO "camp_events" (
  "cycle", "kind", "team", "title", "all_day", "start_date", "end_date",
  "start_time", "end_time", "calendar_event_id", "calendar_synced_version",
  "version", "created_by_user_id", "updated_by_user_id"
)
SELECT
  "cycle", 'meeting', "team", "title", false,
  local_at::date, local_at::date,
  to_char(local_at, 'HH24:MI'),
  to_char(LEAST(local_at + interval '1 hour',
                date_trunc('day', local_at) + interval '23 hours 59 minutes'), 'HH24:MI'),
  event_id, NULL, 1, "created_by_user_id", "updated_by_user_id"
FROM linked;
