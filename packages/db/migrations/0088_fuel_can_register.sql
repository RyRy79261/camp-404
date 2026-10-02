ALTER TABLE "fuel_cans" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD COLUMN "material" text;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD COLUMN "travels_with_user_id" uuid;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD CONSTRAINT "fuel_cans_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD CONSTRAINT "fuel_cans_travels_with_user_id_users_id_fk" FOREIGN KEY ("travels_with_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_cans" ADD CONSTRAINT "fuel_cans_material_check" CHECK ("fuel_cans"."material" is null or "fuel_cans"."material" in ('metal', 'plastic'));