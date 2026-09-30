CREATE TABLE "kitchen_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"day" integer NOT NULL,
	"meal" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_menu_items_day_check" CHECK ("kitchen_menu_items"."day" between 1 and 30),
	CONSTRAINT "kitchen_menu_items_meal_check" CHECK ("kitchen_menu_items"."meal" in ('breakfast', 'lunch', 'dinner'))
);
--> statement-breakpoint
CREATE TABLE "kitchen_shopping_ticks" (
	"cycle" integer NOT NULL,
	"item_key" text NOT NULL,
	"amount" text NOT NULL,
	"ticked_by_user_id" uuid,
	"ticked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_shopping_ticks_cycle_item_key_pk" PRIMARY KEY("cycle","item_key")
);
--> statement-breakpoint
CREATE TABLE "kitchen_snacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"name" text NOT NULL,
	"amount" text,
	"added_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kitchen_menu_items" ADD CONSTRAINT "kitchen_menu_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_menu_items" ADD CONSTRAINT "kitchen_menu_items_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_shopping_ticks" ADD CONSTRAINT "kitchen_shopping_ticks_ticked_by_user_id_users_id_fk" FOREIGN KEY ("ticked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_snacks" ADD CONSTRAINT "kitchen_snacks_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_menu_items_meal_recipe_idx" ON "kitchen_menu_items" USING btree ("cycle","day","meal","recipe_id");--> statement-breakpoint
CREATE INDEX "kitchen_menu_items_cycle_idx" ON "kitchen_menu_items" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "kitchen_snacks_cycle_idx" ON "kitchen_snacks" USING btree ("cycle");