CREATE TABLE "questionnaire_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
