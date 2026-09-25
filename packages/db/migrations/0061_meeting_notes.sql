CREATE TABLE "meeting_note_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"assignee_id" uuid,
	"due_on" date,
	"task_id" uuid
);
--> statement-breakpoint
CREATE TABLE "meeting_note_attendees" (
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "meeting_note_attendees_note_id_user_id_pk" PRIMARY KEY("note_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_note_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" integer NOT NULL,
	"team" "team",
	"title" text NOT NULL,
	"held_at" timestamp NOT NULL,
	"calendar_event_id" text,
	"calendar_event_title" text,
	"agenda" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_note_action_items" ADD CONSTRAINT "meeting_note_action_items_note_id_meeting_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_action_items" ADD CONSTRAINT "meeting_note_action_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_action_items" ADD CONSTRAINT "meeting_note_action_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_attendees" ADD CONSTRAINT "meeting_note_attendees_note_id_meeting_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_attendees" ADD CONSTRAINT "meeting_note_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_decisions" ADD CONSTRAINT "meeting_note_decisions_note_id_meeting_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_note_action_items_note_idx" ON "meeting_note_action_items" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_note_action_items_task_uniq" ON "meeting_note_action_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "meeting_note_attendees_user_idx" ON "meeting_note_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meeting_note_decisions_note_idx" ON "meeting_note_decisions" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "meeting_notes_team_held_idx" ON "meeting_notes" USING btree ("team","held_at");--> statement-breakpoint
CREATE INDEX "meeting_notes_cycle_idx" ON "meeting_notes" USING btree ("cycle");