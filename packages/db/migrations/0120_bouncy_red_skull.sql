CREATE TYPE "public"."camp_event_audience" AS ENUM('camp', 'team', 'team_leads', 'people');--> statement-breakpoint
ALTER TABLE "camp_events" ADD COLUMN "audience" "camp_event_audience" DEFAULT 'camp' NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_events" ADD COLUMN "people_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_events" ADD COLUMN "call_url" text;