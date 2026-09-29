CREATE TABLE "inventory_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"borrower_camp" text NOT NULL,
	"borrower_address" text NOT NULL,
	"lent_at" timestamp DEFAULT now() NOT NULL,
	"lent_by_user_id" uuid,
	"returned_at" timestamp,
	"returned_by_user_id" uuid,
	CONSTRAINT "inventory_loans_count_check" CHECK ("inventory_loans"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "inventory_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"team" "team" NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"item_id" uuid,
	"bought_quantity" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_needs_count_check" CHECK ("inventory_needs"."quantity" >= 1 and "inventory_needs"."bought_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_pledges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"need_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_pledges_count_check" CHECK ("inventory_pledges"."quantity" >= 1)
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "condition" text DEFAULT 'good' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "location" text DEFAULT 'storage_unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "bookable_count" integer;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_updates" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "inventory_updates" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "inventory_bookings" ADD CONSTRAINT "inventory_bookings_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_bookings" ADD CONSTRAINT "inventory_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_lent_by_user_id_users_id_fk" FOREIGN KEY ("lent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_returned_by_user_id_users_id_fk" FOREIGN KEY ("returned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_needs" ADD CONSTRAINT "inventory_needs_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_needs" ADD CONSTRAINT "inventory_needs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pledges" ADD CONSTRAINT "inventory_pledges_need_id_inventory_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."inventory_needs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pledges" ADD CONSTRAINT "inventory_pledges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_bookings_item_user_cycle_idx" ON "inventory_bookings" USING btree ("item_id","user_id","cycle");--> statement-breakpoint
CREATE INDEX "inventory_bookings_user_idx" ON "inventory_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inventory_loans_cycle_idx" ON "inventory_loans" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "inventory_loans_item_idx" ON "inventory_loans" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_needs_cycle_team_idx" ON "inventory_needs" USING btree ("cycle","team");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_pledges_need_user_idx" ON "inventory_pledges" USING btree ("need_id","user_id");--> statement-breakpoint
CREATE INDEX "inventory_pledges_user_idx" ON "inventory_pledges" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_check" CHECK ("inventory_items"."category" in ('kitchen', 'cooling', 'structures', 'power', 'water_and_sanitation', 'decor', 'tools', 'other'));--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_condition_check" CHECK ("inventory_items"."condition" in ('good', 'needs_repair', 'broken'));--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_check" CHECK ("inventory_items"."location" in ('storage_unit', 'custodian_home', 'on_site'));--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_count_check" CHECK ("inventory_items"."quantity" >= 0 and ("inventory_items"."bookable_count" is null or "inventory_items"."bookable_count" >= 1));--> statement-breakpoint
ALTER TABLE "inventory_updates" ADD CONSTRAINT "inventory_updates_condition_check" CHECK ("inventory_updates"."condition" is null or "inventory_updates"."condition" in ('good', 'needs_repair', 'broken'));--> statement-breakpoint
ALTER TABLE "inventory_updates" ADD CONSTRAINT "inventory_updates_location_check" CHECK ("inventory_updates"."location" is null or "inventory_updates"."location" in ('storage_unit', 'custodian_home', 'on_site'));