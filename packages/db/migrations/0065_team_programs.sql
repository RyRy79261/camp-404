CREATE TABLE "team_programs" (
	"team" "team" PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_programs_description_length" CHECK (char_length("team_programs"."description") <= 300),
	CONSTRAINT "team_programs_links_shape" CHECK (jsonb_typeof("team_programs"."links") = 'array' and jsonb_array_length("team_programs"."links") <= 8)
);
