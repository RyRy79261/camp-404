CREATE TYPE "public"."telegram_post_kind" AS ENUM('announcement', 'reminder', 'meeting');--> statement-breakpoint
ALTER TYPE "public"."telegram_announcement_status" ADD VALUE 'sending' BEFORE 'sent';--> statement-breakpoint
ALTER TYPE "public"."telegram_announcement_status" ADD VALUE 'skipped';--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "telegram_on_publish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "telegram_post_announcements" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "telegram_post_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_settings" ADD COLUMN "telegram_post_meetings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "kind" "telegram_post_kind" DEFAULT 'announcement' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "ref_id" uuid;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "button_text" text;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "button_path" text;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD CONSTRAINT "telegram_announcements_dedupe_key_unique" UNIQUE("dedupe_key");