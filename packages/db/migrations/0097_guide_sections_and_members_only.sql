CREATE TABLE "guide_sections" (
	"category" text PRIMARY KEY NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "guide_sections_category_check" CHECK ("guide_sections"."category" in ('before_you_come', 'on_site', 'kitchen', 'safety', 'teams'))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "members_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_sections" ADD CONSTRAINT "guide_sections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;