ALTER TABLE "payments" DROP CONSTRAINT "payments_currency_check";--> statement-breakpoint
ALTER TABLE "reimbursements" DROP CONSTRAINT "reimbursements_currency_check";--> statement-breakpoint
ALTER TABLE "team_budgets" DROP CONSTRAINT "team_budgets_currency_check";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" = 'ZAR');--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_currency_check" CHECK ("reimbursements"."currency" = 'ZAR');--> statement-breakpoint
ALTER TABLE "team_budgets" ADD CONSTRAINT "team_budgets_currency_check" CHECK ("team_budgets"."currency" = 'ZAR');