CREATE TYPE "public"."participation_intent" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
ALTER TABLE "camp_participations" ADD COLUMN "intent" "participation_intent" NOT NULL;