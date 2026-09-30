CREATE TYPE "public"."logistics_phase" AS ENUM('pack', 'travel', 'build', 'burn', 'strike', 'unpack');--> statement-breakpoint
CREATE TABLE "logistics_phases" (
	"cycle" integer NOT NULL,
	"phase" "logistics_phase" NOT NULL,
	"start_date" date,
	"end_date" date,
	"place" text,
	"note" text,
	"calendar_event_id" text,
	"calendar_synced_version" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "logistics_phases_cycle_phase_pk" PRIMARY KEY("cycle","phase"),
	CONSTRAINT "logistics_phases_days_check" CHECK (("logistics_phases"."start_date" is null) = ("logistics_phases"."end_date" is null) and ("logistics_phases"."end_date" is null or "logistics_phases"."end_date" >= "logistics_phases"."start_date"))
);
--> statement-breakpoint
ALTER TABLE "logistics_phases" ADD CONSTRAINT "logistics_phases_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;