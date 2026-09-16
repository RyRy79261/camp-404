CREATE TYPE "public"."payment_status" AS ENUM('pending', 'reconciled', 'waived');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"reference" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ref_code" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_user_cycle_idx" ON "payments" USING btree ("user_id","cycle");--> statement-breakpoint
CREATE INDEX "payments_cycle_idx" ON "payments" USING btree ("cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "users_ref_code_uniq" ON "users" USING btree ("ref_code") WHERE "users"."ref_code" IS NOT NULL;