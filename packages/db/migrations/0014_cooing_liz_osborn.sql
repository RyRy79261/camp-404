CREATE TABLE "camp_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"bootstrapped_at" timestamp,
	"bootstrapped_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_settings_singleton" CHECK ("camp_settings"."id")
);
--> statement-breakpoint
ALTER TABLE "camp_settings" ADD CONSTRAINT "camp_settings_bootstrapped_by_user_id_users_id_fk" FOREIGN KEY ("bootstrapped_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;