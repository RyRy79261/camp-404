-- NOTE: hand-made idempotent (the only exception in this repo to the
-- "never hand-edit a generated migration" rule). An earlier preview of
-- this feature shipped the same CREATE TABLE under a different migration
-- number; after an update-from-main renumbered it to 0007, drizzle tried
-- to re-create an already-existing table on preview databases. Guarding
-- every statement makes re-application a no-op while still building the
-- table on a clean database. Schema is identical to the generated output.
CREATE TABLE IF NOT EXISTS "questionnaire_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"questionnaire_key" text NOT NULL,
	"version" text NOT NULL,
	"edited_by_user_id" uuid,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "questionnaire_edits" ADD CONSTRAINT "questionnaire_edits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "questionnaire_edits" ADD CONSTRAINT "questionnaire_edits_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questionnaire_edits_user_key_created_idx" ON "questionnaire_edits" USING btree ("user_id","questionnaire_key","created_at");
