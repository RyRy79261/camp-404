CREATE TABLE "reimbursement_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reimbursement_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "spent_on" date;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "paid_by_id" uuid;--> statement-breakpoint
ALTER TABLE "team_budgets" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
ALTER TABLE "reimbursement_files" ADD CONSTRAINT "reimbursement_files_reimbursement_id_reimbursements_id_fk" FOREIGN KEY ("reimbursement_id") REFERENCES "public"."reimbursements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_files_claim_idx" ON "reimbursement_files" USING btree ("reimbursement_id");--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursements_cycle_team_idx" ON "reimbursements" USING btree ("cycle","team");