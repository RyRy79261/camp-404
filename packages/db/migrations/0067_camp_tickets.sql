CREATE TYPE "public"."directed_ticket_status" AS ENUM('none', 'allocated', 'can_transfer');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('unknown', 'buying_own', 'has_ticket', 'needs_directed_ticket');--> statement-breakpoint
CREATE TYPE "public"."early_entry_status" AS ENUM('not_needed', 'requested', 'issued');--> statement-breakpoint
CREATE TABLE "camp_tickets" (
	"user_id" uuid NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"ticket_status" "ticket_status" DEFAULT 'unknown' NOT NULL,
	"directed_ticket" "directed_ticket_status" DEFAULT 'none' NOT NULL,
	"early_entry" "early_entry_status" DEFAULT 'not_needed' NOT NULL,
	"passes_updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_tickets_user_id_cycle_pk" PRIMARY KEY("user_id","cycle")
);
--> statement-breakpoint
ALTER TABLE "camp_tickets" ADD CONSTRAINT "camp_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_tickets" ADD CONSTRAINT "camp_tickets_passes_updated_by_user_id_users_id_fk" FOREIGN KEY ("passes_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;