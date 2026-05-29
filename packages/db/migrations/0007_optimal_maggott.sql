CREATE TABLE "questionnaire_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"questionnaire_key" text NOT NULL,
	"version" text NOT NULL,
	"edited_by_user_id" uuid,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questionnaire_edits" ADD CONSTRAINT "questionnaire_edits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_edits" ADD CONSTRAINT "questionnaire_edits_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questionnaire_edits_user_key_created_idx" ON "questionnaire_edits" USING btree ("user_id","questionnaire_key","created_at");