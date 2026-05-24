ALTER TABLE "users" RENAME COLUMN "stack_user_id" TO "auth_user_id";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_stack_user_id_unique";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id");