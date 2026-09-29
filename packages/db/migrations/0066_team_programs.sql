CREATE TABLE "team_programs" (
	"team" "team" PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_programs_description_length" CHECK (char_length("team_programs"."description") <= 300)
);
