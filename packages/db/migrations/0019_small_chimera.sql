DROP INDEX "questionnaire_responses_user_def_idx";--> statement-breakpoint
ALTER TABLE "questionnaire_activations" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire_activations" ADD COLUMN "carry_over" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire_definitions" ADD COLUMN "carry_over" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_responses_user_def_cycle_idx" ON "questionnaire_responses" USING btree ("user_id","definition_key","cycle");