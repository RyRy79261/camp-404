CREATE TABLE "join_pages" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"draft" text DEFAULT '' NOT NULL,
	"published" text,
	"published_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "join_pages_draft_length_check" CHECK (char_length("join_pages"."draft") <= 50000),
	CONSTRAINT "join_pages_published_length_check" CHECK ("join_pages"."published" is null or char_length("join_pages"."published") <= 50000)
);
--> statement-breakpoint
ALTER TABLE "join_pages" ADD CONSTRAINT "join_pages_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;