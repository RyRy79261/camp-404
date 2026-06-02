CREATE TYPE "public"."promotion_request_status" AS ENUM('sent', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "captain_promotion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_user_id" uuid,
	"requested_by_user_id" uuid,
	"status" "promotion_request_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" ADD CONSTRAINT "captain_promotion_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" ADD CONSTRAINT "captain_promotion_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "captain_promotion_open_per_target_idx" ON "captain_promotion_requests" USING btree ("target_user_id") WHERE "captain_promotion_requests"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "captain_promotion_target_idx" ON "captain_promotion_requests" USING btree ("target_user_id");