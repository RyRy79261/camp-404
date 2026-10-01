ALTER TABLE "afrikaburn_deadlines" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "afrikaburn_deadlines" ADD COLUMN "skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "afrikaburn_deadlines_cycle_kind_uniq" ON "afrikaburn_deadlines" USING btree ("cycle","kind") WHERE "afrikaburn_deadlines"."kind" is not null;--> statement-breakpoint
ALTER TABLE "afrikaburn_deadlines" ADD CONSTRAINT "afrikaburn_deadlines_skipped_check" CHECK (not "afrikaburn_deadlines"."skipped" or "afrikaburn_deadlines"."due_date" is null);