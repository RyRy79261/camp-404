CREATE TYPE "public"."dues_charge_kind" AS ENUM('fee', 'rental', 'settle_up', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'international_transfer', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('captain', 'member', 'statement');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'refunded', 'declined');--> statement-breakpoint
CREATE TABLE "dues_accounts" (
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"pledged_tier_id" uuid,
	"pledged_amount_cents" integer,
	"pledged_at" timestamp,
	"plan_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dues_accounts_user_id_cycle_pk" PRIMARY KEY("user_id","cycle"),
	CONSTRAINT "dues_accounts_pledge_check" CHECK ("dues_accounts"."pledged_amount_cents" is null or "dues_accounts"."pledged_amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "dues_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"kind" "dues_charge_kind" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"standard_amount_cents" integer,
	"concession_reason" text,
	"settle_up_id" uuid,
	"cancelled_at" timestamp,
	"cancelled_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dues_charges_amount_check" CHECK ("dues_charges"."amount_cents" > 0 or ("dues_charges"."kind" = 'settle_up' and "dues_charges"."amount_cents" < 0)),
	CONSTRAINT "dues_charges_currency_check" CHECK ("dues_charges"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "dues_instalments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"due_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dues_instalments_amount_check" CHECK ("dues_instalments"."amount_cents" > 0),
	CONSTRAINT "dues_instalments_currency_check" CHECK ("dues_instalments"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "dues_settle_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"description" text NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"member_count" integer NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dues_settle_ups_currency_check" CHECK ("dues_settle_ups"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "dues_years" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"deadline" date,
	"full_refund_until" date,
	"partial_refund_until" date,
	"partial_refund_pct" integer,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dues_years_partial_refund_pct_check" CHECK ("dues_years"."partial_refund_pct" is null or ("dues_years"."partial_refund_pct" between 1 and 99))
);
--> statement-breakpoint
CREATE TABLE "fee_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_tiers_amount_check" CHECK ("fee_tiers"."amount_cents" > 0),
	CONSTRAINT "fee_tiers_currency_check" CHECK ("fee_tiers"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"proposed_cents" integer,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"note" text,
	"decline_reason" text,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_amount_check" CHECK ("payment_refunds"."amount_cents" >= 0),
	CONSTRAINT "payment_refunds_currency_check" CHECK ("payment_refunds"."currency" = 'ZAR')
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "source" "payment_source" DEFAULT 'captain' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "method" "payment_method";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "proof_pathname" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "proof_content_type" text;--> statement-breakpoint
ALTER TABLE "dues_accounts" ADD CONSTRAINT "dues_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_accounts" ADD CONSTRAINT "dues_accounts_pledged_tier_id_fee_tiers_id_fk" FOREIGN KEY ("pledged_tier_id") REFERENCES "public"."fee_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_charges" ADD CONSTRAINT "dues_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_charges" ADD CONSTRAINT "dues_charges_settle_up_id_dues_settle_ups_id_fk" FOREIGN KEY ("settle_up_id") REFERENCES "public"."dues_settle_ups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_charges" ADD CONSTRAINT "dues_charges_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_charges" ADD CONSTRAINT "dues_charges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_instalments" ADD CONSTRAINT "dues_instalments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_settle_ups" ADD CONSTRAINT "dues_settle_ups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_years" ADD CONSTRAINT "dues_years_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dues_charges_user_cycle_idx" ON "dues_charges" USING btree ("user_id","cycle");--> statement-breakpoint
CREATE INDEX "dues_charges_cycle_idx" ON "dues_charges" USING btree ("cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "dues_charges_one_fee_idx" ON "dues_charges" USING btree ("user_id","cycle") WHERE "dues_charges"."kind" = 'fee' and "dues_charges"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "dues_instalments_user_cycle_idx" ON "dues_instalments" USING btree ("user_id","cycle");--> statement-breakpoint
CREATE INDEX "fee_tiers_cycle_idx" ON "fee_tiers" USING btree ("cycle");--> statement-breakpoint
CREATE INDEX "payment_refunds_user_cycle_idx" ON "payment_refunds" USING btree ("user_id","cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_one_live_idx" ON "payment_refunds" USING btree ("payment_id") WHERE "payment_refunds"."status" <> 'declined';