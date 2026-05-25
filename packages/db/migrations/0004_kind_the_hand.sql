CREATE TYPE "public"."telegram_announcement_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."telegram_chat_kind" AS ENUM('main_group', 'announcement_channel');--> statement-breakpoint
CREATE TYPE "public"."telegram_invite_status" AS ENUM('pending', 'used', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "telegram_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid,
	"chat_id" text NOT NULL,
	"body" text NOT NULL,
	"status" "telegram_announcement_status" DEFAULT 'queued' NOT NULL,
	"message_id" text,
	"error_message" text,
	"send_after" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "telegram_chat_kind" NOT NULL,
	"chat_id" text NOT NULL,
	"title" text NOT NULL,
	"username" text,
	"added_by_user_id" uuid,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "telegram_chats_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"invite_link" text NOT NULL,
	"status" "telegram_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"joined_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_invites_invite_link_unique" UNIQUE("invite_link")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_handle" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_user_id" text;--> statement-breakpoint
ALTER TABLE "telegram_announcements" ADD CONSTRAINT "telegram_announcements_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_invites" ADD CONSTRAINT "telegram_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_announcements_status_send_after_idx" ON "telegram_announcements" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "telegram_announcements_broadcast_idx" ON "telegram_announcements" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "telegram_invites_user_idx" ON "telegram_invites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_invites_status_idx" ON "telegram_invites" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_user_id_unique" UNIQUE("telegram_user_id");