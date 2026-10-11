ALTER TYPE "public"."notification_kind" ADD VALUE 'pet_in';--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"kind_other" text,
	"stupid_thing" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"hint" text,
	"module_key" text,
	"front_photo_path" text,
	"side_photo_path" text,
	"marked_in_by_user_id" uuid,
	"marked_in_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pets_kind_check" CHECK ("pets"."kind" in ('cat', 'dog', 'other')),
	CONSTRAINT "pets_status_check" CHECK ("pets"."status" in ('waiting', 'in')),
	CONSTRAINT "pets_module_key_when_in_check" CHECK (("pets"."status" = 'in') = ("pets"."module_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_marked_in_by_user_id_users_id_fk" FOREIGN KEY ("marked_in_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pets_owner_idx" ON "pets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pets_module_key_uniq" ON "pets" USING btree ("module_key");