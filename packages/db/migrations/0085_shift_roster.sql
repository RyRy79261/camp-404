CREATE TYPE "public"."shift_slot_status" AS ENUM('open', 'not_needed');--> statement-breakpoint
CREATE TABLE "shift_signups" (
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shift_signups_slot_id_user_id_pk" PRIMARY KEY("slot_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shift_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_id" uuid NOT NULL,
	"day" date NOT NULL,
	"status" "shift_slot_status" DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"team" "team" NOT NULL,
	"name" text NOT NULL,
	"start_minute" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"places" integer NOT NULL,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shift_types_start_check" CHECK ("shift_types"."start_minute" >= 0 and "shift_types"."start_minute" < 1440),
	CONSTRAINT "shift_types_duration_check" CHECK ("shift_types"."duration_minutes" >= 15 and "shift_types"."duration_minutes" <= 720),
	CONSTRAINT "shift_types_places_check" CHECK ("shift_types"."places" >= 1 and "shift_types"."places" <= 20)
);
--> statement-breakpoint
CREATE TABLE "volunteer_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"department" text NOT NULL,
	"day" date NOT NULL,
	"start_minute" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volunteer_shifts_start_check" CHECK ("volunteer_shifts"."start_minute" >= 0 and "volunteer_shifts"."start_minute" < 1440),
	CONSTRAINT "volunteer_shifts_duration_check" CHECK ("volunteer_shifts"."duration_minutes" >= 15 and "volunteer_shifts"."duration_minutes" <= 720)
);
--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_slot_id_shift_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."shift_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_slots" ADD CONSTRAINT "shift_slots_type_id_shift_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."shift_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_signups_user_idx" ON "shift_signups" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_slots_type_day_uniq" ON "shift_slots" USING btree ("type_id","day");--> statement-breakpoint
CREATE INDEX "shift_types_cycle_idx" ON "shift_types" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "volunteer_shifts_user_cycle_idx" ON "volunteer_shifts" USING btree ("user_id","cycle");