CREATE TYPE "public"."mcp_audit_outcome" AS ENUM('success', 'error');--> statement-breakpoint
CREATE TYPE "public"."mcp_client_auth_method" AS ENUM('none', 'client_secret_basic', 'client_secret_post');--> statement-breakpoint
CREATE TYPE "public"."mcp_code_challenge_method" AS ENUM('S256', 'plain');--> statement-breakpoint
CREATE TABLE "mcp_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"refresh_token_hash" text,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"refresh_expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "mcp_access_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"tool" text NOT NULL,
	"args_json" jsonb,
	"outcome" "mcp_audit_outcome" NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" "mcp_code_challenge_method" NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_secret_hash" text,
	"client_name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"token_endpoint_auth_method" "mcp_client_auth_method" NOT NULL,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_data_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_data_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_client_id_mcp_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit_log" ADD CONSTRAINT "mcp_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_client_id_mcp_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_access_tokens_user_idx" ON "mcp_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_access_tokens_expires_idx" ON "mcp_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_log_user_created_idx" ON "mcp_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_auth_codes_client_idx" ON "mcp_auth_codes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "mcp_auth_codes_expires_idx" ON "mcp_auth_codes" USING btree ("expires_at");