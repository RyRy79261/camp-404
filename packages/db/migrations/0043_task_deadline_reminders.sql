CREATE TYPE "public"."task_reminder_stage" AS ENUM('day_before', 'due_day');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'task_reminder';--> statement-breakpoint
CREATE TABLE "task_deadline_reminders" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"due_day" date NOT NULL,
	"stage" "task_reminder_stage" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_deadline_reminders_task_id_user_id_due_day_stage_pk" PRIMARY KEY("task_id","user_id","due_day","stage")
);
--> statement-breakpoint
ALTER TABLE "task_deadline_reminders" ADD CONSTRAINT "task_deadline_reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_deadline_reminders" ADD CONSTRAINT "task_deadline_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;