CREATE TABLE "inkblot_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"initials" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inkblot_scores_initials_check" CHECK ("inkblot_scores"."initials" ~ '^([A-Z0-9]{1,3}|[?]{3})$'),
	CONSTRAINT "inkblot_scores_duration_check" CHECK ("inkblot_scores"."duration_ms" between 8000 and 3600000)
);
--> statement-breakpoint
ALTER TABLE "inkblot_scores" ADD CONSTRAINT "inkblot_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inkblot_scores_board_idx" ON "inkblot_scores" USING btree ("duration_ms","created_at");--> statement-breakpoint
CREATE INDEX "inkblot_scores_user_id_idx" ON "inkblot_scores" USING btree ("user_id");