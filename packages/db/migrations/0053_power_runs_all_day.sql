ALTER TABLE "power_plans" DROP CONSTRAINT "power_plans_hours_check";--> statement-breakpoint
ALTER TABLE "power_plans" ALTER COLUMN "days_on_site" SET DEFAULT 11;--> statement-breakpoint
ALTER TABLE "power_plans" DROP COLUMN "compare_run_from_hour";--> statement-breakpoint
ALTER TABLE "power_plans" DROP COLUMN "compare_run_to_hour";--> statement-breakpoint
ALTER TABLE "power_plans" ADD CONSTRAINT "power_plans_hours_check" CHECK ("power_plans"."run_from_hour" between 0 and 23 and "power_plans"."run_to_hour" between 0 and 23);