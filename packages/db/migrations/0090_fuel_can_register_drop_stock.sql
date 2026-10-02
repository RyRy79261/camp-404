ALTER TABLE "refuel_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "refuel_entries" CASCADE;--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP CONSTRAINT "fuel_cans_location_check";--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP CONSTRAINT "fuel_cans_fill_check";--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP CONSTRAINT "fuel_cans_inventory_item_id_inventory_items_id_fk";
--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP COLUMN "label";--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP COLUMN "litres";--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP COLUMN "location";--> statement-breakpoint
ALTER TABLE "fuel_cans" DROP COLUMN "inventory_item_id";--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD CONSTRAINT "fuel_cans_size_check" CHECK ("fuel_cans"."capacity_litres" > 0);