CREATE TABLE "generators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"rated_kva" double precision NOT NULL,
	"max_kva" double precision NOT NULL,
	"tank_litres" double precision NOT NULL,
	"runtime_50_hours" double precision NOT NULL,
	"runtime_100_hours" double precision NOT NULL,
	"fuel_type" text NOT NULL,
	"owner" text NOT NULL,
	"inventory_item_id" uuid,
	"noise_note" text,
	"archived_at" timestamp,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "generators_fuel_type_check" CHECK ("generators"."fuel_type" in ('petrol', 'diesel')),
	CONSTRAINT "generators_owner_check" CHECK ("generators"."owner" in ('camp', 'member_lent', 'hired')),
	CONSTRAINT "generators_kva_check" CHECK ("generators"."rated_kva" > 0 and "generators"."max_kva" >= "generators"."rated_kva"),
	CONSTRAINT "generators_runtime_check" CHECK ("generators"."tank_litres" > 0 and "generators"."runtime_100_hours" > 0 and "generators"."runtime_50_hours" > "generators"."runtime_100_hours")
);
--> statement-breakpoint
CREATE TABLE "power_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"name" text NOT NULL,
	"area" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"watts_each" double precision NOT NULL,
	"surge_watts_each" double precision,
	"duty_pct" double precision DEFAULT 100 NOT NULL,
	"schedule" text NOT NULL,
	"hours_per_day" double precision,
	"windows" jsonb,
	"from_day" integer,
	"to_day" integer,
	"volts" double precision DEFAULT 230 NOT NULL,
	"current" text DEFAULT 'ac' NOT NULL,
	"owner" text NOT NULL,
	"neighbour_camp" text,
	"inventory_item_id" uuid,
	"circuit" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "power_loads_category_check" CHECK ("power_loads"."category" in ('refrigeration', 'lighting_functional', 'lighting_decorative', 'sound', 'charging', 'tools', 'other')),
	CONSTRAINT "power_loads_schedule_check" CHECK ("power_loads"."schedule" in ('full_time', 'hours_per_day', 'windows')),
	CONSTRAINT "power_loads_current_check" CHECK ("power_loads"."current" in ('ac', 'dc')),
	CONSTRAINT "power_loads_owner_check" CHECK ("power_loads"."owner" in ('camp', 'member', 'neighbour')),
	CONSTRAINT "power_loads_draw_check" CHECK ("power_loads"."quantity" >= 1 and "power_loads"."watts_each" > 0 and "power_loads"."duty_pct" between 1 and 100),
	CONSTRAINT "power_loads_day_check" CHECK ("power_loads"."from_day" >= 1 and "power_loads"."to_day" >= "power_loads"."from_day")
);
--> statement-breakpoint
CREATE TABLE "power_plans" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"generator_id" uuid,
	"second_generator_note" text,
	"power_factor" double precision DEFAULT 0.8 NOT NULL,
	"days_on_site" integer DEFAULT 7 NOT NULL,
	"first_powered_day" date,
	"run_from_hour" integer,
	"run_to_hour" integer,
	"compare_run_from_hour" integer DEFAULT 18,
	"compare_run_to_hour" integer DEFAULT 6,
	"low_load_factor" double precision DEFAULT 1 NOT NULL,
	"safety_margin_pct" double precision DEFAULT 20 NOT NULL,
	"can_litres" double precision DEFAULT 20 NOT NULL,
	"cans_owned" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "power_plans_power_factor_check" CHECK ("power_plans"."power_factor" between 0.5 and 1),
	CONSTRAINT "power_plans_days_check" CHECK ("power_plans"."days_on_site" >= 1),
	CONSTRAINT "power_plans_hours_check" CHECK ("power_plans"."run_from_hour" between 0 and 23 and "power_plans"."run_to_hour" between 0 and 23 and "power_plans"."compare_run_from_hour" between 0 and 23 and "power_plans"."compare_run_to_hour" between 0 and 23),
	CONSTRAINT "power_plans_fuel_check" CHECK ("power_plans"."low_load_factor" >= 1 and "power_plans"."safety_margin_pct" between 0 and 100 and "power_plans"."can_litres" > 0 and "power_plans"."cans_owned" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "watts_each" double precision;--> statement-breakpoint
ALTER TABLE "generators" ADD CONSTRAINT "generators_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generators" ADD CONSTRAINT "generators_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_loads" ADD CONSTRAINT "power_loads_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_loads" ADD CONSTRAINT "power_loads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_plans" ADD CONSTRAINT "power_plans_generator_id_generators_id_fk" FOREIGN KEY ("generator_id") REFERENCES "public"."generators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_plans" ADD CONSTRAINT "power_plans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "power_loads_cycle_idx" ON "power_loads" USING btree ("cycle");