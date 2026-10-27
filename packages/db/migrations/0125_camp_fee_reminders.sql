ALTER TYPE "public"."notification_kind" ADD VALUE 'fee_reminder';--> statement-breakpoint
CREATE TABLE "fee_payment_reminders" (
	"user_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"due_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_payment_reminders_user_id_cycle_due_on_pk" PRIMARY KEY("user_id","cycle","due_on")
);
--> statement-breakpoint
ALTER TABLE "fee_payment_reminders" ADD CONSTRAINT "fee_payment_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;