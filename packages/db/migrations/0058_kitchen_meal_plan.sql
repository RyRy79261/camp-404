CREATE TABLE "kitchen_meal_plan_days" (
	"cycle" integer NOT NULL,
	"day" integer NOT NULL,
	"breakfast" integer DEFAULT 0 NOT NULL,
	"lunch" integer DEFAULT 0 NOT NULL,
	"dinner" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kitchen_meal_plan_days_cycle_day_pk" PRIMARY KEY("cycle","day"),
	CONSTRAINT "kitchen_meal_plan_days_day_check" CHECK ("kitchen_meal_plan_days"."day" between 1 and 30),
	CONSTRAINT "kitchen_meal_plan_days_plates_check" CHECK ("kitchen_meal_plan_days"."breakfast" between 0 and 500 and "kitchen_meal_plan_days"."lunch" between 0 and 500 and "kitchen_meal_plan_days"."dinner" between 0 and 500)
);
--> statement-breakpoint
CREATE TABLE "kitchen_meal_plans" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"days_on_site" integer DEFAULT 11 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_meal_plans_days_check" CHECK ("kitchen_meal_plans"."days_on_site" between 1 and 30)
);
--> statement-breakpoint
ALTER TABLE "kitchen_meal_plan_days" ADD CONSTRAINT "kitchen_meal_plan_days_cycle_kitchen_meal_plans_cycle_fk" FOREIGN KEY ("cycle") REFERENCES "public"."kitchen_meal_plans"("cycle") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_meal_plans" ADD CONSTRAINT "kitchen_meal_plans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;