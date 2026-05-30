CREATE TYPE "public"."broadcast_presentation" AS ENUM('acknowledge', 'popup', 'feed');--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "presentation" "broadcast_presentation" DEFAULT 'feed' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "presentation" "broadcast_presentation" DEFAULT 'feed' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "acknowledged_at" timestamp;--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_ack_idx" ON "notification_deliveries" USING btree ("user_id","acknowledged_at");