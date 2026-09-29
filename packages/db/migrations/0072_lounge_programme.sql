CREATE TABLE "lounge_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"host_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"needs" text[] DEFAULT '{}'::text[] NOT NULL,
	"needs_note" text,
	"preferred_days" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"preferred_bands" text[] DEFAULT '{}'::text[] NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"public_guide" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"decision_note" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lounge_offers_kind_check" CHECK ("lounge_offers"."kind" in ('activity', 'dj_set', 'workshop', 'other')),
	CONSTRAINT "lounge_offers_status_check" CHECK ("lounge_offers"."status" in ('offered', 'accepted', 'declined', 'needs_changes')),
	CONSTRAINT "lounge_offers_duration_check" CHECK ("lounge_offers"."duration_minutes" between 15 and 480),
	CONSTRAINT "lounge_offers_needs_check" CHECK ("lounge_offers"."needs" <@ array['space', 'sound', 'power', 'materials']::text[]),
	CONSTRAINT "lounge_offers_bands_check" CHECK ("lounge_offers"."preferred_bands" <@ array['morning', 'midday', 'afternoon', 'sunset', 'night', 'late_night']::text[])
);
--> statement-breakpoint
CREATE TABLE "lounge_settings" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"music_policy" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lounge_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"offer_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"placed_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lounge_slots_day_check" CHECK ("lounge_slots"."day" between 1 and 14),
	CONSTRAINT "lounge_slots_start_check" CHECK ("lounge_slots"."start_minute" between 0 and 1439)
);
--> statement-breakpoint
ALTER TABLE "lounge_offers" ADD CONSTRAINT "lounge_offers_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_offers" ADD CONSTRAINT "lounge_offers_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_settings" ADD CONSTRAINT "lounge_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_slots" ADD CONSTRAINT "lounge_slots_offer_id_lounge_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."lounge_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_slots" ADD CONSTRAINT "lounge_slots_placed_by_user_id_users_id_fk" FOREIGN KEY ("placed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lounge_offers_cycle_idx" ON "lounge_offers" USING btree ("cycle","status");--> statement-breakpoint
CREATE INDEX "lounge_offers_host_idx" ON "lounge_offers" USING btree ("host_id","cycle");--> statement-breakpoint
CREATE INDEX "lounge_slots_cycle_idx" ON "lounge_slots" USING btree ("cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "lounge_slots_offer_place_uniq" ON "lounge_slots" USING btree ("offer_id","day","start_minute");