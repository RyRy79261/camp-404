ALTER TABLE "reimbursements" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reimbursements" ALTER COLUMN "status" SET DEFAULT 'submitted'::text;--> statement-breakpoint
DROP TYPE "public"."reimbursement_status";--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('submitted', 'approved', 'paid', 'rejected');--> statement-breakpoint
ALTER TABLE "reimbursements" ALTER COLUMN "status" SET DEFAULT 'submitted'::"public"."reimbursement_status";--> statement-breakpoint
ALTER TABLE "reimbursements" ALTER COLUMN "status" SET DATA TYPE "public"."reimbursement_status" USING "status"::"public"."reimbursement_status";