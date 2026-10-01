-- The Survival Guide (#250) reads published chapters from document_versions.
-- A document published before that table existed (through the Claude
-- connector) has no version row, so it becomes version 1 with the text it
-- has now, published by its author at its last change. Idempotent: a document
-- that already has a version is left alone, and running it again adds nothing.
INSERT INTO "document_versions" (
  "document_id", "version", "title", "category", "team", "kind", "markdown",
  "card", "published_at", "published_by"
)
SELECT "id", 1, "title", "category", "team", "kind", "markdown",
  NULL, "updated_at", "author_id"
FROM "documents"
WHERE "published" AND "published_version" IS NULL AND "kind" = 'chapter'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "documents"
SET "published_version" = 1
WHERE "published" AND "published_version" IS NULL AND "kind" = 'chapter';
