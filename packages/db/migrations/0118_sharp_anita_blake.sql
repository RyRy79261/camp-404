ALTER TYPE "public"."telegram_post_kind" ADD VALUE 'questionnaire';--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD COLUMN "tag_user_ids" uuid[];