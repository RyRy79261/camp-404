ALTER TYPE "public"."broadcast_kind" ADD VALUE 'car_message';--> statement-breakpoint
ALTER TYPE "public"."broadcast_scope" ADD VALUE 'car';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'car_message';--> statement-breakpoint
CREATE TABLE "lift_requests" (
	"user_id" uuid NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"driver_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lift_requests_user_id_cycle_pk" PRIMARY KEY("user_id","cycle")
);
--> statement-breakpoint
CREATE TABLE "transport_trailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"towed_by_user_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lift_requests" ADD CONSTRAINT "lift_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lift_requests" ADD CONSTRAINT "lift_requests_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trailers" ADD CONSTRAINT "transport_trailers_towed_by_user_id_users_id_fk" FOREIGN KEY ("towed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lift_requests_driver_idx" ON "lift_requests" USING btree ("driver_user_id","cycle");--> statement-breakpoint
CREATE INDEX "transport_trailers_cycle_idx" ON "transport_trailers" USING btree ("cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_trailers_one_per_car_idx" ON "transport_trailers" USING btree ("towed_by_user_id","cycle");