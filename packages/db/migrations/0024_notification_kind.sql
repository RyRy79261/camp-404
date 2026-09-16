CREATE TYPE "public"."notification_kind" AS ENUM('announcement', 'team_message', 'lead_directive', 'questionnaire_release', 'questionnaire_reminder', 'approval_decision');--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "kind" "notification_kind" DEFAULT 'announcement' NOT NULL;--> statement-breakpoint
-- Backfill the rows written before the column existed. Every existing delivery
-- came from a broadcast, and kindForBroadcast (@camp404/core) is the mapping:
-- a reminder is a questionnaire reminder, a system broadcast that points at a
-- questionnaire is its release notice, team messages and lead directives keep
-- their name, and everything else is an announcement (the column default).
UPDATE "notification_deliveries" AS d
SET "kind" = CASE
  WHEN b."kind" = 'reminder' THEN 'questionnaire_reminder'::"notification_kind"
  WHEN b."kind" = 'system' AND d."ref_type" = 'questionnaire_activation' THEN 'questionnaire_release'::"notification_kind"
  WHEN b."kind" = 'team_message' THEN 'team_message'::"notification_kind"
  WHEN b."kind" = 'lead_directive' THEN 'lead_directive'::"notification_kind"
  ELSE 'announcement'::"notification_kind"
END
FROM "broadcasts" AS b
WHERE d."broadcast_id" = b."id";
