-- Chats added with /notifyhere before `posts_since` existed (kind
-- announcement_channel, not archived) keep being places Ol' Jeb posts in.
-- Idempotent: only rows not marked yet.
UPDATE "telegram_chats"
SET "posts_since" = "added_at"
WHERE "kind" = 'announcement_channel'
  AND "archived_at" IS NULL
  AND "posts_since" IS NULL;
