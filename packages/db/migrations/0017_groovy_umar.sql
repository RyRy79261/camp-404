CREATE TYPE "public"."questionnaire_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TABLE "questionnaire_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"definition_key" text NOT NULL,
	"definition_version" text NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activation_id" uuid,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_versions" (
	"definition_key" text NOT NULL,
	"version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"published_by_user_id" uuid,
	CONSTRAINT "questionnaire_versions_definition_key_version_pk" PRIMARY KEY("definition_key","version")
);
--> statement-breakpoint
ALTER TABLE "questionnaire_definitions" ADD COLUMN "status" "questionnaire_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire_definitions" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "questionnaire_definitions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_activation_id_questionnaire_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "public"."questionnaire_activations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_definition_key_questionnaire_definitions_key_fk" FOREIGN KEY ("definition_key") REFERENCES "public"."questionnaire_definitions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_responses_user_def_idx" ON "questionnaire_responses" USING btree ("user_id","definition_key");--> statement-breakpoint
CREATE INDEX "questionnaire_responses_def_idx" ON "questionnaire_responses" USING btree ("definition_key");--> statement-breakpoint
ALTER TABLE "questionnaire_definitions" ADD CONSTRAINT "questionnaire_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;