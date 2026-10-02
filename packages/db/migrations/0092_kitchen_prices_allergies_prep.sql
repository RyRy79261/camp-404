CREATE TABLE "kitchen_allergen_plans" (
	"menu_item_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"details" text NOT NULL,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"set_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_allergen_plans_kind_check" CHECK ("kitchen_allergen_plans"."kind" in ('portion', 'substitution'))
);
--> statement-breakpoint
CREATE TABLE "kitchen_prep_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"what" text NOT NULL,
	"timing" text NOT NULL,
	"due_date" date NOT NULL,
	"task_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_prep_steps_timing_check" CHECK ("kitchen_prep_steps"."timing" in ('day_before', 'same_day', 'before_leaving'))
);
--> statement-breakpoint
CREATE TABLE "kitchen_shopping_prices" (
	"cycle" integer NOT NULL,
	"item_key" text NOT NULL,
	"shop" text,
	"amount_cents" integer,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"price_kind" text DEFAULT 'estimate' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_shopping_prices_cycle_item_key_pk" PRIMARY KEY("cycle","item_key"),
	CONSTRAINT "kitchen_shopping_prices_currency_check" CHECK ("kitchen_shopping_prices"."currency" = 'ZAR'),
	CONSTRAINT "kitchen_shopping_prices_amount_check" CHECK ("kitchen_shopping_prices"."amount_cents" is null or "kitchen_shopping_prices"."amount_cents" >= 0),
	CONSTRAINT "kitchen_shopping_prices_kind_check" CHECK ("kitchen_shopping_prices"."price_kind" in ('estimate', 'paid'))
);
--> statement-breakpoint
CREATE TABLE "recipe_allergen_corrections" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"set_by_user_id" uuid,
	"set_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dietary_requirements" ADD COLUMN "food_reactions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "dietary_requirements" ADD COLUMN "diets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "dietary_requirements" ADD COLUMN "foods_saved_at" timestamp;--> statement-breakpoint
ALTER TABLE "kitchen_allergen_plans" ADD CONSTRAINT "kitchen_allergen_plans_menu_item_id_kitchen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."kitchen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_allergen_plans" ADD CONSTRAINT "kitchen_allergen_plans_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_prep_steps" ADD CONSTRAINT "kitchen_prep_steps_menu_item_id_kitchen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."kitchen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_prep_steps" ADD CONSTRAINT "kitchen_prep_steps_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_prep_steps" ADD CONSTRAINT "kitchen_prep_steps_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_shopping_prices" ADD CONSTRAINT "kitchen_shopping_prices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_allergen_corrections" ADD CONSTRAINT "recipe_allergen_corrections_version_id_recipe_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_allergen_corrections" ADD CONSTRAINT "recipe_allergen_corrections_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kitchen_prep_steps_item_idx" ON "kitchen_prep_steps" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "kitchen_prep_steps_cycle_idx" ON "kitchen_prep_steps" USING btree ("cycle","due_date");