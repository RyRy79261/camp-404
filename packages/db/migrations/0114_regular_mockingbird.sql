CREATE TYPE "public"."telegram_delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."telegram_notices" AS ENUM('mine', 'all');--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_link_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "telegram_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "telegram_status" "telegram_delivery_status" DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_dm_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_notices" "telegram_notices" DEFAULT 'mine' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_link_codes_user_idx" ON "telegram_link_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_telegram_queue_idx" ON "notification_deliveries" USING btree ("created_at") WHERE "notification_deliveries"."telegram_status" = 'queued';