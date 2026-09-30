CREATE TYPE "public"."logistics_attendance_answer" AS ENUM('going', 'maybe', 'cant');--> statement-breakpoint
CREATE TABLE "afrikaburn_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"note" text,
	"done" boolean DEFAULT false NOT NULL,
	"calendar_event_id" text,
	"calendar_synced_version" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logistics_attendance" (
	"cycle" integer NOT NULL,
	"phase" "logistics_phase" NOT NULL,
	"user_id" uuid NOT NULL,
	"answer" "logistics_attendance_answer" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "logistics_attendance_cycle_phase_user_id_pk" PRIMARY KEY("cycle","phase","user_id"),
	CONSTRAINT "logistics_attendance_phase_check" CHECK ("logistics_attendance"."phase" in ('pack', 'build', 'strike', 'unpack'))
);
--> statement-breakpoint
ALTER TABLE "afrikaburn_deadlines" ADD CONSTRAINT "afrikaburn_deadlines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afrikaburn_deadlines" ADD CONSTRAINT "afrikaburn_deadlines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_attendance" ADD CONSTRAINT "logistics_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "afrikaburn_deadlines_cycle_idx" ON "afrikaburn_deadlines" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "logistics_attendance_user_idx" ON "logistics_attendance" USING btree ("user_id");