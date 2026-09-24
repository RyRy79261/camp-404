CREATE TYPE "public"."participation_intent" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TYPE "public"."participation_status" AS ENUM('applied', 'maybe', 'accepted', 'waitlisted', 'not_attending');--> statement-breakpoint
CREATE TABLE "camp_participations" (
	"user_id" uuid NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"status" "participation_status" NOT NULL,
	"intent" "participation_intent" NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_participations_user_id_cycle_pk" PRIMARY KEY("user_id","cycle")
);
--> statement-breakpoint
ALTER TABLE "camp_participations" ADD CONSTRAINT "camp_participations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_participations" ADD CONSTRAINT "camp_participations_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camp_participations_cycle_status_idx" ON "camp_participations" USING btree ("cycle","status");