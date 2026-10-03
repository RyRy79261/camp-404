ALTER TABLE "shift_types" ADD COLUMN "duty_card_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_duty_card_id_documents_id_fk" FOREIGN KEY ("duty_card_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_types_duty_card_idx" ON "shift_types" USING btree ("duty_card_id");