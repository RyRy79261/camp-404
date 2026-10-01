CREATE TYPE "public"."document_kind" AS ENUM('chapter', 'duty_card');--> statement-breakpoint
CREATE TABLE "document_reads" (
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_reads_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"team" "team",
	"kind" "document_kind" NOT NULL,
	"markdown" text NOT NULL,
	"card" jsonb,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"published_by" uuid,
	CONSTRAINT "document_versions_document_id_version_pk" PRIMARY KEY("document_id","version"),
	CONSTRAINT "document_versions_version_check" CHECK ("document_versions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "kind" "document_kind" DEFAULT 'chapter' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "card" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "published_version" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "cycle_reviewed" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_card_check" CHECK (("documents"."kind" = 'duty_card') = ("documents"."card" is not null));