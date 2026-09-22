ALTER TABLE "broadcasts" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "pinned_by" uuid;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcasts_pinned_idx" ON "broadcasts" USING btree ("published_at" DESC NULLS LAST) WHERE "broadcasts"."pinned_at" is not null;