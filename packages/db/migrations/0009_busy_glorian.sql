CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "invite_codes" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_status" "approval_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_decided_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approval_decided_by_user_id_users_id_fk" FOREIGN KEY ("approval_decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;