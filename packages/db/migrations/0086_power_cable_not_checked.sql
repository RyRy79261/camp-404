ALTER TABLE "power_grid_nodes" ALTER COLUMN "have_cable" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "power_grid_nodes" ALTER COLUMN "have_cable" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "power_grid_nodes" ALTER COLUMN "have_adapter" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "power_grid_nodes" ALTER COLUMN "have_adapter" DROP NOT NULL;