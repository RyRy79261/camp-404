CREATE TABLE "action_rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "action_rate_limit_window_start_idx" ON "action_rate_limit" USING btree ("window_start");