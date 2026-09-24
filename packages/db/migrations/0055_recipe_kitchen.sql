CREATE TYPE "public"."ingredient_keeping_class" AS ENUM('fresh', 'resilient', 'frozen', 'stable_fridge', 'shelf_stable');--> statement-breakpoint
CREATE TYPE "public"."recipe_run_outcome" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recipe_scaling_class" AS ENUM('linear', 'sublinear', 'fixed_per_batch', 'step');--> statement-breakpoint
CREATE TYPE "public"."recipe_unit" AS ENUM('g', 'ml', 'each');--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"other_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text,
	"keeping_class" "ingredient_keeping_class",
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical_unit" "recipe_unit",
	"conversions" jsonb,
	"pack_sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"cycle" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_plate_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"plates" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"pots" integer,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"source" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_plate_counts_plates_check" CHECK ("recipe_plate_counts"."plates" between 1 and 500),
	CONSTRAINT "recipe_plate_counts_source_check" CHECK ("recipe_plate_counts"."source" in ('version', 'proofread'))
);
--> statement-breakpoint
CREATE TABLE "recipe_proofread_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"note" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"outcome" "recipe_run_outcome" DEFAULT 'queued' NOT NULL,
	"error" text,
	"result" jsonb,
	"kind" text DEFAULT 'recipe' NOT NULL,
	"plates" integer,
	"version_id" uuid,
	"previous_status" "recipe_status",
	"previous_run_id" uuid,
	"source_id" uuid,
	"stage" text,
	"exchange" jsonb,
	CONSTRAINT "recipe_proofread_runs_kind_check" CHECK ("recipe_proofread_runs"."kind" in ('recipe', 'plates', 'source')),
	CONSTRAINT "recipe_proofread_runs_stage_check" CHECK ("recipe_proofread_runs"."stage" in ('sending', 'reading', 'checking', 'saving')),
	CONSTRAINT "recipe_proofread_runs_plates_check" CHECK ("recipe_proofread_runs"."plates" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "recipe_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"serves" integer,
	"ingredients" jsonb NOT NULL,
	"equipment" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"notes" jsonb NOT NULL,
	"author_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_sources_serves_check" CHECK ("recipe_sources"."serves" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "recipe_version_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"quantity_per_serving" double precision NOT NULL,
	"unit" "recipe_unit" NOT NULL,
	"scaling_class" "recipe_scaling_class" NOT NULL,
	"scaling_exponent" double precision,
	"per_batch_amount" double precision,
	"step_size" double precision,
	"conversion_note" text,
	"prep_note" text,
	"optional" boolean DEFAULT false NOT NULL,
	"keeping_class" "ingredient_keeping_class",
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"servings_basis" integer NOT NULL,
	"body" jsonb,
	"method" text,
	"prep_plan" jsonb,
	"flags" jsonb,
	"report" jsonb,
	"run_id" uuid,
	"reason" text,
	"author_id" uuid,
	"source_id" uuid,
	"scaling_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ALTER COLUMN "previous_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "status" SET DEFAULT 'suggested'::text;--> statement-breakpoint
DROP TYPE "public"."recipe_status";--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('suggested', 'changes_requested', 'approved', 'queued', 'analysing', 'proofread', 'accepted', 'rejected');--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ALTER COLUMN "previous_status" SET DATA TYPE "public"."recipe_status" USING "previous_status"::"public"."recipe_status";--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "status" SET DEFAULT 'suggested'::"public"."recipe_status";--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "status" SET DATA TYPE "public"."recipe_status" USING "status"::"public"."recipe_status";--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "submitter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "recipe_proofread_daily_cap" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "kitchen_largest_pot_litres" integer;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "kitchen_burner_count" integer;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "kitchen_plates_breakfast" integer;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "kitchen_plates_lunch" integer;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "kitchen_plates_dinner" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "suitability_note" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "text_author_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "ai_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "changes_note" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "queued_by" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "queued_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rerun_request" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rerun_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "rerun_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "latest_run_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "accepted_version_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "variant_of_recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_lessons" ADD CONSTRAINT "recipe_lessons_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lessons" ADD CONSTRAINT "recipe_lessons_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_plate_counts" ADD CONSTRAINT "recipe_plate_counts_version_id_recipe_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_plate_counts" ADD CONSTRAINT "recipe_plate_counts_run_id_recipe_proofread_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recipe_proofread_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ADD CONSTRAINT "recipe_proofread_runs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ADD CONSTRAINT "recipe_proofread_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ADD CONSTRAINT "recipe_proofread_runs_version_id_recipe_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ADD CONSTRAINT "recipe_proofread_runs_previous_run_id_recipe_proofread_runs_id_fk" FOREIGN KEY ("previous_run_id") REFERENCES "public"."recipe_proofread_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_proofread_runs" ADD CONSTRAINT "recipe_proofread_runs_source_id_recipe_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."recipe_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version_ingredients" ADD CONSTRAINT "recipe_version_ingredients_version_id_recipe_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version_ingredients" ADD CONSTRAINT "recipe_version_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_run_id_recipe_proofread_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recipe_proofread_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_source_id_recipe_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."recipe_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_name_lower_idx" ON "ingredients" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "recipe_lessons_recipe_idx" ON "recipe_lessons" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_plate_counts_version_plates_idx" ON "recipe_plate_counts" USING btree ("version_id","plates");--> statement-breakpoint
CREATE INDEX "recipe_proofread_runs_requested_at_idx" ON "recipe_proofread_runs" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "recipe_proofread_runs_recipe_idx" ON "recipe_proofread_runs" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_proofread_runs_open_plates_idx" ON "recipe_proofread_runs" USING btree ("version_id","plates") WHERE "recipe_proofread_runs"."kind" = 'plates' AND "recipe_proofread_runs"."outcome" IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_sources_recipe_version_idx" ON "recipe_sources" USING btree ("recipe_id","version");--> statement-breakpoint
CREATE INDEX "recipe_version_ingredients_version_idx" ON "recipe_version_ingredients" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "recipe_version_ingredients_ingredient_idx" ON "recipe_version_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_versions_recipe_version_idx" ON "recipe_versions" USING btree ("recipe_id","version");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_text_author_id_users_id_fk" FOREIGN KEY ("text_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_queued_by_users_id_fk" FOREIGN KEY ("queued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rerun_requested_by_users_id_fk" FOREIGN KEY ("rerun_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_latest_run_id_recipe_proofread_runs_id_fk" FOREIGN KEY ("latest_run_id") REFERENCES "public"."recipe_proofread_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_accepted_version_id_recipe_versions_id_fk" FOREIGN KEY ("accepted_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_variant_of_recipe_id_recipes_id_fk" FOREIGN KEY ("variant_of_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_recipe_proofread_daily_cap_check" CHECK ("camp_settings"."recipe_proofread_daily_cap" between 0 and 50);--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_kitchen_largest_pot_litres_check" CHECK ("camp_settings"."kitchen_largest_pot_litres" between 1 and 500);--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_kitchen_burner_count_check" CHECK ("camp_settings"."kitchen_burner_count" between 1 and 20);--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_kitchen_plates_breakfast_check" CHECK ("camp_settings"."kitchen_plates_breakfast" between 1 and 500);--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_kitchen_plates_lunch_check" CHECK ("camp_settings"."kitchen_plates_lunch" between 1 and 500);--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_kitchen_plates_dinner_check" CHECK ("camp_settings"."kitchen_plates_dinner" between 1 and 500);