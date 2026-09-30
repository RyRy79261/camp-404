ALTER TABLE "reimbursements" ALTER COLUMN "amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursements" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "team_budgets" DROP COLUMN "assigned_amount";--> statement-breakpoint
ALTER TABLE "team_budgets" DROP COLUMN "perceived_amount";