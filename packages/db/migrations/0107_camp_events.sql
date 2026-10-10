CREATE TYPE "public"."camp_event_kind" AS ENUM('event', 'meeting');--> statement-breakpoint
CREATE TABLE "camp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"kind" "camp_event_kind" NOT NULL,
	"team" "team",
	"title" text NOT NULL,
	"all_day" boolean NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"place" text,
	"description" text,
	"calendar_event_id" text NOT NULL,
	"calendar_synced_version" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_events_days_check" CHECK ("camp_events"."end_date" >= "camp_events"."start_date"),
	CONSTRAINT "camp_events_times_check" CHECK (("camp_events"."all_day" and "camp_events"."start_time" is null and "camp_events"."end_time" is null) or (not "camp_events"."all_day" and "camp_events"."start_time" is not null and "camp_events"."end_time" is not null and "camp_events"."end_time" > "camp_events"."start_time" and "camp_events"."end_date" = "camp_events"."start_date"))
);
--> statement-breakpoint
ALTER TABLE "camp_events" ADD CONSTRAINT "camp_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_events" ADD CONSTRAINT "camp_events_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "camp_events_calendar_event_uniq" ON "camp_events" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX "camp_events_days_idx" ON "camp_events" USING btree ("start_date","end_date");