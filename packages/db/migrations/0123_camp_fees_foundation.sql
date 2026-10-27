CREATE TYPE "public"."camp_bill_repeat" AS ENUM('once', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."fee_timing" AS ENUM('all_by_end_nov', 'all_by_end_dec', 'part_by_end_nov', 'part_by_end_dec', 'all_by_15_jan', 'talk_to_captain');--> statement-breakpoint
CREATE TABLE "camp_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"as_of" date NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_balances_currency_check" CHECK ("camp_balances"."currency" = 'ZAR')
);
--> statement-breakpoint
CREATE TABLE "camp_bank_details" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"details" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_bank_details_one_row" CHECK ("camp_bank_details"."id")
);
--> statement-breakpoint
CREATE TABLE "camp_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"payee" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"due_on" date NOT NULL,
	"repeat" "camp_bill_repeat" DEFAULT 'once' NOT NULL,
	"times" integer DEFAULT 1 NOT NULL,
	"paid_count" integer DEFAULT 0 NOT NULL,
	"paid_on" date,
	"planned" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "camp_bills_amount_check" CHECK ("camp_bills"."amount_cents" > 0),
	CONSTRAINT "camp_bills_currency_check" CHECK ("camp_bills"."currency" = 'ZAR'),
	CONSTRAINT "camp_bills_times_check" CHECK ("camp_bills"."times" between 1 and 60 and ("camp_bills"."repeat" = 'monthly' or "camp_bills"."times" = 1)),
	CONSTRAINT "camp_bills_paid_count_check" CHECK ("camp_bills"."paid_count" between 0 and "camp_bills"."times")
);
--> statement-breakpoint
ALTER TABLE "dues_accounts" DROP CONSTRAINT "dues_accounts_pledge_check";--> statement-breakpoint
ALTER TABLE "dues_accounts" ADD COLUMN "pay_by" "fee_timing";--> statement-breakpoint
ALTER TABLE "dues_accounts" ADD COLUMN "subsidy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dues_years" ADD COLUMN "collecting_fees" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "camp_balances" ADD CONSTRAINT "camp_balances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_bank_details" ADD CONSTRAINT "camp_bank_details_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_bills" ADD CONSTRAINT "camp_bills_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp_bills" ADD CONSTRAINT "camp_bills_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camp_balances_as_of_idx" ON "camp_balances" USING btree ("as_of","created_at");--> statement-breakpoint
CREATE INDEX "camp_bills_due_on_idx" ON "camp_bills" USING btree ("due_on");--> statement-breakpoint
ALTER TABLE "dues_accounts" ADD CONSTRAINT "dues_accounts_pledge_check" CHECK ("dues_accounts"."pledged_amount_cents" is null or "dues_accounts"."pledged_amount_cents" > 0 or ("dues_accounts"."subsidy" and "dues_accounts"."pledged_amount_cents" = 0));