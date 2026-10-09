CREATE TABLE "team_role_holders" (
	"role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_role_holders_role_id_user_id_pk" PRIMARY KEY("role_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_role_keen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"team" "team" NOT NULL,
	"role_id" uuid,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_role_settings" (
	"cycle" integer NOT NULL,
	"team" "team" NOT NULL,
	"lead_places" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_role_settings_cycle_team_pk" PRIMARY KEY("cycle","team"),
	CONSTRAINT "team_role_settings_lead_places_check" CHECK ("team_role_settings"."lead_places" >= 1 and "team_role_settings"."lead_places" <= 20)
);
--> statement-breakpoint
CREATE TABLE "team_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"team" "team" NOT NULL,
	"name" text NOT NULL,
	"places" integer DEFAULT 1 NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_roles_places_check" CHECK ("team_roles"."places" >= 1 and "team_roles"."places" <= 20),
	CONSTRAINT "team_roles_name_check" CHECK (char_length("team_roles"."name") between 1 and 60),
	CONSTRAINT "team_roles_note_check" CHECK ("team_roles"."note" is null or char_length("team_roles"."note") <= 120)
);
--> statement-breakpoint
ALTER TABLE "team_role_holders" ADD CONSTRAINT "team_role_holders_role_id_team_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."team_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_holders" ADD CONSTRAINT "team_role_holders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_holders" ADD CONSTRAINT "team_role_holders_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_keen" ADD CONSTRAINT "team_role_keen_role_id_team_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."team_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_keen" ADD CONSTRAINT "team_role_keen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_role_holders_user_idx" ON "team_role_holders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_role_keen_role_user_uniq" ON "team_role_keen" USING btree ("role_id","user_id") WHERE "team_role_keen"."role_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "team_role_keen_lead_user_uniq" ON "team_role_keen" USING btree ("cycle","team","user_id") WHERE "team_role_keen"."role_id" is null;--> statement-breakpoint
CREATE INDEX "team_role_keen_cycle_idx" ON "team_role_keen" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "team_role_keen_user_idx" ON "team_role_keen" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_roles_cycle_team_idx" ON "team_roles" USING btree ("cycle","team");