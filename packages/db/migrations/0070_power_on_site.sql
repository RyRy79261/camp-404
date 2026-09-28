CREATE TABLE "fuel_cans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"label" text NOT NULL,
	"capacity_litres" double precision NOT NULL,
	"litres" double precision NOT NULL,
	"location" text NOT NULL,
	"inventory_item_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_cans_location_check" CHECK ("fuel_cans"."location" in ('storage', 'vehicle', 'on_site')),
	CONSTRAINT "fuel_cans_fill_check" CHECK ("fuel_cans"."capacity_litres" > 0 and "fuel_cans"."litres" >= 0 and "fuel_cans"."litres" <= "fuel_cans"."capacity_litres")
);
--> statement-breakpoint
CREATE TABLE "generator_readiness_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"generator_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"owner_user_id" uuid,
	"due_on" date,
	"done_at" timestamp,
	"done_by_user_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "power_grid_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"cable" text,
	"cable_length_m" double precision,
	"cable_gauge_mm2" double precision,
	"cable_rated_amps" double precision,
	"adapter" text,
	"have_cable" boolean DEFAULT true NOT NULL,
	"have_adapter" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "power_grid_nodes_kind_check" CHECK ("power_grid_nodes"."kind" in ('generator', 'junction', 'end_point')),
	CONSTRAINT "power_grid_nodes_root_check" CHECK (("power_grid_nodes"."kind" = 'generator') = ("power_grid_nodes"."parent_id" is null))
);
--> statement-breakpoint
CREATE TABLE "power_sharing_agreements" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"partner_camp" text NOT NULL,
	"contact_role" text,
	"generator_source" text NOT NULL,
	"generator_id" uuid,
	"their_generator" text,
	"partner_fuel_pct" double precision,
	"watch_cover" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "power_sharing_agreements_source_check" CHECK ("power_sharing_agreements"."generator_source" in ('ours', 'theirs')),
	CONSTRAINT "power_sharing_agreements_pct_check" CHECK ("power_sharing_agreements"."partner_fuel_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "power_work_plan_tasks" (
	"cycle" integer NOT NULL,
	"task_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "power_work_plan_tasks_cycle_task_id_pk" PRIMARY KEY("cycle","task_id")
);
--> statement-breakpoint
CREATE TABLE "refuel_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"generator_id" uuid NOT NULL,
	"refuelled_at" timestamp NOT NULL,
	"litres" double precision NOT NULL,
	"from_can_id" uuid,
	"done_by_user_id" uuid,
	"hour_meter" double precision,
	"note" text,
	"from_paper" boolean DEFAULT false NOT NULL,
	"corrects_entry_id" uuid,
	"voided" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refuel_entries_litres_check" CHECK ("refuel_entries"."litres" > 0),
	CONSTRAINT "refuel_entries_void_check" CHECK (not "refuel_entries"."voided" or "refuel_entries"."corrects_entry_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "power_loads" ADD COLUMN "grid_node_id" uuid;--> statement-breakpoint
ALTER TABLE "power_plans" ADD COLUMN "low_fuel_days" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD CONSTRAINT "fuel_cans_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD CONSTRAINT "fuel_cans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_readiness_items" ADD CONSTRAINT "generator_readiness_items_generator_id_generators_id_fk" FOREIGN KEY ("generator_id") REFERENCES "public"."generators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_readiness_items" ADD CONSTRAINT "generator_readiness_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_readiness_items" ADD CONSTRAINT "generator_readiness_items_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_readiness_items" ADD CONSTRAINT "generator_readiness_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_grid_nodes" ADD CONSTRAINT "power_grid_nodes_parent_id_power_grid_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."power_grid_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_grid_nodes" ADD CONSTRAINT "power_grid_nodes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_sharing_agreements" ADD CONSTRAINT "power_sharing_agreements_generator_id_generators_id_fk" FOREIGN KEY ("generator_id") REFERENCES "public"."generators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_sharing_agreements" ADD CONSTRAINT "power_sharing_agreements_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_work_plan_tasks" ADD CONSTRAINT "power_work_plan_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_entries" ADD CONSTRAINT "refuel_entries_generator_id_generators_id_fk" FOREIGN KEY ("generator_id") REFERENCES "public"."generators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_entries" ADD CONSTRAINT "refuel_entries_from_can_id_fuel_cans_id_fk" FOREIGN KEY ("from_can_id") REFERENCES "public"."fuel_cans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_entries" ADD CONSTRAINT "refuel_entries_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_entries" ADD CONSTRAINT "refuel_entries_corrects_entry_id_refuel_entries_id_fk" FOREIGN KEY ("corrects_entry_id") REFERENCES "public"."refuel_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_entries" ADD CONSTRAINT "refuel_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fuel_cans_cycle_idx" ON "fuel_cans" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "generator_readiness_items_generator_idx" ON "generator_readiness_items" USING btree ("cycle","generator_id");--> statement-breakpoint
CREATE INDEX "power_grid_nodes_cycle_idx" ON "power_grid_nodes" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "power_grid_nodes_parent_idx" ON "power_grid_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "refuel_entries_cycle_idx" ON "refuel_entries" USING btree ("cycle","refuelled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refuel_entries_corrects_uniq" ON "refuel_entries" USING btree ("corrects_entry_id");--> statement-breakpoint
ALTER TABLE "power_loads" ADD CONSTRAINT "power_loads_grid_node_id_power_grid_nodes_id_fk" FOREIGN KEY ("grid_node_id") REFERENCES "public"."power_grid_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "power_loads_grid_node_idx" ON "power_loads" USING btree ("grid_node_id");--> statement-breakpoint
ALTER TABLE "power_plans" ADD CONSTRAINT "power_plans_low_fuel_check" CHECK ("power_plans"."low_fuel_days" >= 0);