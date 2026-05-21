CREATE TYPE "public"."activation_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."broadcast_kind" AS ENUM('announcement', 'team_message', 'lead_directive', 'reminder', 'system');--> statement-breakpoint
CREATE TYPE "public"."broadcast_scope" AS ENUM('everyone', 'team', 'rank', 'team_leads', 'individual');--> statement-breakpoint
CREATE TYPE "public"."membership_tier" AS ENUM('full', 'build_week_only');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'in_app', 'both');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('web', 'ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."push_delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_scope" AS ENUM('everyone', 'team', 'rank', 'team_leads', 'individual', 'opt_in');--> statement-breakpoint
CREATE TYPE "public"."rank" AS ENUM('captain', 'team_lead', 'member');--> statement-breakpoint
CREATE TYPE "public"."recipe_source" AS ENUM('url', 'text', 'voice');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('pending', 'analysing', 'ready', 'scheduled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('submitted', 'approved', 'paid', 'reconciled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."required_action_status" AS ENUM('pending', 'completed', 'waived', 'expired');--> statement-breakpoint
CREATE TYPE "public"."required_action_type" AS ENUM('questionnaire', 'acknowledgement', 'payment', 'profile_update');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."team" AS ENUM('kitchen', 'build', 'fire', 'art', 'vehicle', 'onboarding', 'safety');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adoptees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_number" integer NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"dietary_notes" text,
	"arrival" timestamp,
	"departure" timestamp,
	"tent_assigned" text,
	"bedding_assigned" text,
	"fridge_shelf_assigned" text,
	"sponsor_id" uuid,
	"approved_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broadcast_targets" (
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "broadcast_targets_broadcast_id_user_id_pk" PRIMARY KEY("broadcast_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid,
	"kind" "broadcast_kind" NOT NULL,
	"scope" "broadcast_scope" NOT NULL,
	"team" "team",
	"target_rank" "rank",
	"title" text NOT NULL,
	"body" text NOT NULL,
	"channel" "notification_channel" DEFAULT 'both' NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "burner_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dietary_requirements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergies" text,
	"intolerances" text,
	"is_anaphylactic" boolean DEFAULT false NOT NULL,
	"notes" text,
	"version" text NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"team" "team",
	"markdown" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"intends_to_drive" boolean DEFAULT false NOT NULL,
	"intent_registered_at" timestamp,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_registration" text,
	"seats_total" integer,
	"seats_offered" integer,
	"can_offer_lifts" boolean DEFAULT false NOT NULL,
	"offroad_experienced" boolean DEFAULT false NOT NULL,
	"can_tow" boolean DEFAULT false NOT NULL,
	"proficiency_notes" text,
	"departure_city" text,
	"arrival_at" timestamp,
	"departure_at" timestamp,
	"notes" text,
	"version" text NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invite_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"created_by_user_id" uuid,
	"note" text,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"push_status" "push_delivery_status" DEFAULT 'queued' NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"read_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"token" text NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questionnaire_activation_targets" (
	"activation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "questionnaire_activation_targets_activation_id_user_id_pk" PRIMARY KEY("activation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questionnaire_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionnaire_key" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scope" "questionnaire_scope" NOT NULL,
	"team" "team",
	"target_rank" "rank",
	"blocking" boolean DEFAULT true NOT NULL,
	"status" "activation_status" DEFAULT 'draft' NOT NULL,
	"due_at" timestamp,
	"activated_by_user_id" uuid,
	"opened_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" uuid NOT NULL,
	"source" "recipe_source" NOT NULL,
	"status" "recipe_status" DEFAULT 'pending' NOT NULL,
	"source_url" text,
	"raw_text" text,
	"audio_blob_url" text,
	"transcript" text,
	"normalised" jsonb,
	"dietary_tags" jsonb DEFAULT '[]'::jsonb,
	"analysed_at" timestamp,
	"scheduled_for" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reimbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" uuid NOT NULL,
	"amount_zar" numeric(12, 2) NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"receipt_blob_url" text NOT NULL,
	"voice_memo_blob_url" text,
	"eft_details_encrypted" text NOT NULL,
	"status" "reimbursement_status" DEFAULT 'submitted' NOT NULL,
	"approver_id" uuid,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "required_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "required_action_type" NOT NULL,
	"action_key" text NOT NULL,
	"version" text,
	"activation_id" uuid,
	"title" text NOT NULL,
	"blocking" boolean DEFAULT true NOT NULL,
	"status" "required_action_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"team" "team",
	"created_by_user_id" uuid,
	"due_at" timestamp,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_memberships" (
	"user_id" uuid NOT NULL,
	"team" "team" NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_user_id_team_pk" PRIMARY KEY("user_id","team")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stack_user_id" text NOT NULL,
	"display_name" text,
	"rank" "rank" DEFAULT 'member' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"membership_tier" "membership_tier",
	"dues_paid" boolean DEFAULT false NOT NULL,
	"dues_paid_at" timestamp,
	"passport_encrypted" text,
	"sa_id_encrypted" text,
	"eft_details_encrypted" text,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"previous_afrikaburns" integer DEFAULT 0,
	"previous_burning_mans" integer DEFAULT 0,
	"first_time" boolean DEFAULT false,
	"emergency_contacts" jsonb,
	"invite_code" text,
	"terms_version" text,
	"terms_consented_at" timestamp,
	"sanitised" boolean DEFAULT false NOT NULL,
	"sanitised_at" timestamp,
	"lost_cat_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_stack_user_id_unique" UNIQUE("stack_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_rsvps" (
	"workshop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_rsvps_workshop_id_user_id_pk" PRIMARY KEY("workshop_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"capacity" integer DEFAULT 20 NOT NULL,
	"host_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adoptees" ADD CONSTRAINT "adoptees_sponsor_id_users_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adoptees" ADD CONSTRAINT "adoptees_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broadcast_targets" ADD CONSTRAINT "broadcast_targets_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broadcast_targets" ADD CONSTRAINT "broadcast_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "burner_profiles" ADD CONSTRAINT "burner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dietary_requirements" ADD CONSTRAINT "dietary_requirements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_activation_targets" ADD CONSTRAINT "questionnaire_activation_targets_activation_id_questionnaire_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "public"."questionnaire_activations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_activation_targets" ADD CONSTRAINT "questionnaire_activation_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_activations" ADD CONSTRAINT "questionnaire_activations_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "required_actions" ADD CONSTRAINT "required_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "required_actions" ADD CONSTRAINT "required_actions_activation_id_questionnaire_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "public"."questionnaire_activations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_rsvps" ADD CONSTRAINT "workshop_rsvps_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshop_rsvps" ADD CONSTRAINT "workshop_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workshops" ADD CONSTRAINT "workshops_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "broadcasts_sender_idx" ON "broadcasts" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "broadcasts_created_at_idx" ON "broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_slug_idx" ON "documents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_idx" ON "invite_codes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_user_read_idx" ON "notification_deliveries" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_broadcast_idx" ON "notification_deliveries" USING btree ("broadcast_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_idx" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questionnaire_activations_key_idx" ON "questionnaire_activations" USING btree ("questionnaire_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questionnaire_activations_status_idx" ON "questionnaire_activations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_status_idx" ON "recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_submitter_idx" ON "recipes" USING btree ("submitter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reimbursements_status_idx" ON "reimbursements" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reimbursements_submitter_idx" ON "reimbursements" USING btree ("submitter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "required_actions_user_action_idx" ON "required_actions" USING btree ("user_id","action_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "required_actions_user_status_idx" ON "required_actions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_team_idx" ON "tasks" USING btree ("team");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_memberships_team_idx" ON "team_memberships" USING btree ("team");