CREATE TABLE "camp_layout_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"number" integer NOT NULL,
	"body" jsonb NOT NULL,
	"note" text,
	"saved_by_user_id" uuid,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_layout_versions_number_check" CHECK ("camp_layout_versions"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "camp_layouts" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"latest_version" integer DEFAULT 0 NOT NULL,
	"share_token" text,
	"shared_at" timestamp,
	"shared_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_layouts_share_token_uniq" UNIQUE("share_token")
);
--> statement-breakpoint
ALTER TABLE "camp_layout_versions" ADD CONSTRAINT "camp_layout_versions_cycle_camp_layouts_cycle_fk" FOREIGN KEY ("cycle") REFERENCES "public"."camp_layouts"("cycle") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_layout_versions" ADD CONSTRAINT "camp_layout_versions_saved_by_user_id_users_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_layouts" ADD CONSTRAINT "camp_layouts_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "camp_layout_versions_cycle_number_uniq" ON "camp_layout_versions" USING btree ("cycle","number");