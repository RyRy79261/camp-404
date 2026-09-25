CREATE TABLE "join_site_content" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "camp_title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "camp_blurb" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_on_join" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "join_site_content" ADD CONSTRAINT "join_site_content_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;