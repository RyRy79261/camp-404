CREATE TYPE "public"."inventory_update_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"details" text,
	"team" "team" NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit" text,
	"weight_kg" numeric(10, 2),
	"requires_maintenance" boolean DEFAULT false NOT NULL,
	"maintenance_interval_days" integer,
	"last_maintained_at" timestamp,
	"next_maintenance_due_at" timestamp,
	"maintenance_notes" text,
	"custodian_user_id" uuid,
	"storage_location" text,
	"last_checked_at" timestamp,
	"last_checked_by_user_id" uuid,
	"created_by_user_id" uuid,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid,
	"proposed_by_user_id" uuid NOT NULL,
	"status" "inventory_update_status" DEFAULT 'pending' NOT NULL,
	"name" text NOT NULL,
	"details" text,
	"team" "team" NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text,
	"weight_kg" numeric(10, 2),
	"requires_maintenance" boolean DEFAULT false NOT NULL,
	"maintenance_interval_days" integer,
	"custodian_user_id" uuid,
	"storage_location" text,
	"maintenance_performed_at" timestamp,
	"note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_custodian_user_id_users_id_fk" FOREIGN KEY ("custodian_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_last_checked_by_user_id_users_id_fk" FOREIGN KEY ("last_checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_updates" ADD CONSTRAINT "inventory_updates_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_updates" ADD CONSTRAINT "inventory_updates_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_updates" ADD CONSTRAINT "inventory_updates_custodian_user_id_users_id_fk" FOREIGN KEY ("custodian_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_updates" ADD CONSTRAINT "inventory_updates_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_team_idx" ON "inventory_items" USING btree ("team");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_custodian_idx" ON "inventory_items" USING btree ("custodian_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_maintenance_due_idx" ON "inventory_items" USING btree ("next_maintenance_due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_updates_item_idx" ON "inventory_updates" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_updates_status_idx" ON "inventory_updates" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_updates_proposed_by_idx" ON "inventory_updates" USING btree ("proposed_by_user_id");--> statement-breakpoint
ALTER TABLE "public"."broadcasts" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."documents" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."inventory_items" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."inventory_updates" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."questionnaire_activations" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."reimbursements" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."tasks" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."team_budgets" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."team_memberships" ALTER COLUMN "team" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."team";--> statement-breakpoint
CREATE TYPE "public"."team" AS ENUM('kitchen', 'structures', 'power_and_lighting', 'sanitation_and_water', 'health_and_safety', 'art_and_activities', 'ministry_of_memes', 'ministry_of_vibes');--> statement-breakpoint
ALTER TABLE "public"."broadcasts" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."documents" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."inventory_items" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."inventory_updates" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."questionnaire_activations" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."reimbursements" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."tasks" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."team_budgets" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";--> statement-breakpoint
ALTER TABLE "public"."team_memberships" ALTER COLUMN "team" SET DATA TYPE "public"."team" USING "team"::"public"."team";