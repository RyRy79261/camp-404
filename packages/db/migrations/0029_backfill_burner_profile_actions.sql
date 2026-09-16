-- Give every member who joined before signup seeding their burner_profile
-- gate row, so the gate works without an operator running anything. A
-- finished profile gets a completed row (or finished members would be sent
-- back to onboarding). Everyone else gets a pending row with no version, so
-- any completion satisfies it. The system account and erased accounts are
-- skipped. A member who already has the row keeps it untouched.
INSERT INTO "required_actions" ("user_id", "type", "action_key", "title", "status", "completed_at")
SELECT
  "users"."id",
  'questionnaire',
  'burner_profile',
  'Complete your burner profile',
  CASE
    WHEN "burner_profiles"."completed_at" IS NULL THEN 'pending'::"required_action_status"
    ELSE 'completed'::"required_action_status"
  END,
  "burner_profiles"."completed_at"
FROM "users"
LEFT JOIN "burner_profiles" ON "burner_profiles"."user_id" = "users"."id"
WHERE "users"."is_system" = false AND "users"."sanitised" = false
ON CONFLICT ("user_id", "action_key") DO NOTHING;
