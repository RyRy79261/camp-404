CREATE TABLE "report_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"issue_number" integer,
	"issue_url" text,
	"report_title" text,
	"report_text" text,
	"filed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_screenshots_type_check" CHECK ("report_screenshots"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "report_screenshots_size_check" CHECK ("report_screenshots"."size_bytes" > 0 and "report_screenshots"."size_bytes" <= 5242880)
);
--> statement-breakpoint
ALTER TABLE "report_screenshots" ADD CONSTRAINT "report_screenshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_screenshots_user_idx" ON "report_screenshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_screenshots_filed_idx" ON "report_screenshots" USING btree ("filed_at" DESC NULLS LAST);