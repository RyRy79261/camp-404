CREATE TYPE "public"."rental_choice" AS ENUM('own', 'need');--> statement-breakpoint
CREATE TYPE "public"."rental_order_status" AS ENUM('draft', 'submitted', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."rental_source" AS ENUM('camp', 'supplier');--> statement-breakpoint
CREATE TABLE "rental_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"name" text NOT NULL,
	"is_tent" boolean DEFAULT false NOT NULL,
	"sleeps" integer DEFAULT 1 NOT NULL,
	"camp_price_cents" integer,
	"camp_stock_count" integer,
	"supplier_price_cents" integer,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"reserve_count" integer DEFAULT 0 NOT NULL,
	"reserve_source" "rental_source" DEFAULT 'supplier' NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rental_items_sleeps_check" CHECK ("rental_items"."sleeps" between 1 and 12 and ("rental_items"."is_tent" or "rental_items"."sleeps" = 1)),
	CONSTRAINT "rental_items_price_check" CHECK (("rental_items"."camp_price_cents" is not null or "rental_items"."supplier_price_cents" is not null) and coalesce("rental_items"."camp_price_cents", 0) >= 0 and coalesce("rental_items"."supplier_price_cents", 0) >= 0),
	CONSTRAINT "rental_items_camp_stock_check" CHECK (("rental_items"."camp_price_cents" is null) = ("rental_items"."camp_stock_count" is null) and coalesce("rental_items"."camp_stock_count", 1) >= 1),
	CONSTRAINT "rental_items_reserve_check" CHECK ("rental_items"."reserve_count" >= 0),
	CONSTRAINT "rental_items_currency_check" CHECK ("rental_items"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "rental_line_sharers" (
	"line_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "rental_line_sharers_line_id_user_id_pk" PRIMARY KEY("line_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rental_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"choice" "rental_choice" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"source" "rental_source",
	"unit_price_cents" integer,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"tent_label" text,
	"own_description" text,
	"own_sleeps" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rental_order_lines_quantity_check" CHECK ("rental_order_lines"."quantity" between 1 and 10),
	CONSTRAINT "rental_order_lines_price_check" CHECK (("rental_order_lines"."source" is null) = ("rental_order_lines"."unit_price_cents" is null) and coalesce("rental_order_lines"."unit_price_cents", 0) >= 0),
	CONSTRAINT "rental_order_lines_own_check" CHECK (("rental_order_lines"."choice" = 'own' or ("rental_order_lines"."own_description" is null and "rental_order_lines"."own_sleeps" is null)) and coalesce("rental_order_lines"."own_sleeps", 1) between 1 and 12),
	CONSTRAINT "rental_order_lines_currency_check" CHECK ("rental_order_lines"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "rental_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"status" "rental_order_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp,
	"confirmed_at" timestamp,
	"confirmed_by_user_id" uuid,
	"total_cents" integer,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"charge_id" uuid,
	"filled_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rental_orders_total_check" CHECK ("rental_orders"."total_cents" is null or "rental_orders"."total_cents" >= 0),
	CONSTRAINT "rental_orders_currency_check" CHECK ("rental_orders"."currency" = 'ZAR')
);
--> statement-breakpoint
ALTER TABLE "rental_line_sharers" ADD CONSTRAINT "rental_line_sharers_line_id_rental_order_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."rental_order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_line_sharers" ADD CONSTRAINT "rental_line_sharers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_order_lines" ADD CONSTRAINT "rental_order_lines_order_id_rental_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."rental_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_order_lines" ADD CONSTRAINT "rental_order_lines_item_id_rental_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_charge_id_dues_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."dues_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_filled_by_user_id_users_id_fk" FOREIGN KEY ("filled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_items_cycle_idx" ON "rental_items" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "rental_line_sharers_user_idx" ON "rental_line_sharers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_order_lines_order_item_idx" ON "rental_order_lines" USING btree ("order_id","item_id");--> statement-breakpoint
CREATE INDEX "rental_order_lines_item_idx" ON "rental_order_lines" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_orders_user_cycle_idx" ON "rental_orders" USING btree ("user_id","cycle");--> statement-breakpoint
CREATE INDEX "rental_orders_cycle_idx" ON "rental_orders" USING btree ("cycle");