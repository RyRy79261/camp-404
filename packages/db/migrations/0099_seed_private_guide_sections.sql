-- The Survival Guide's five sections, each private until a captain puts it on
-- survival-guide.camp-404.com (#250, owner 2026-10-04: everything starts
-- private). Idempotent: a section already there keeps its switch.
INSERT INTO "guide_sections" ("category", "public")
VALUES
  ('before_you_come', false),
  ('on_site', false),
  ('kitchen', false),
  ('safety', false),
  ('teams', false)
ON CONFLICT ("category") DO NOTHING;
