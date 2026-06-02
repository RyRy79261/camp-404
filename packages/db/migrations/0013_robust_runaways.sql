ALTER TABLE "captain_promotion_requests" DROP CONSTRAINT "captain_promotion_requests_target_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" DROP CONSTRAINT "captain_promotion_requests_requested_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" ALTER COLUMN "target_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" ALTER COLUMN "requested_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" ADD CONSTRAINT "captain_promotion_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captain_promotion_requests" ADD CONSTRAINT "captain_promotion_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;