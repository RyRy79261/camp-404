-- The Claude connector's log (mcp_audit_log) stored a failed call's raw error
-- text. A failed query's text is "Failed query: <sql>\nparams: <values>", so
-- it held the values being saved: phone numbers, answers, diets. From now on
-- the log keeps only the error's class and Postgres code (runTool), and an
-- erasure clears a member's arguments and error text. This clears what is
-- already there. Idempotent: a second run matches nothing.

-- 1. Raw query failures: the values go, the fact that it failed stays.
-- drizzle-orm 0.45 wraps a failed query on the drivers we use (neon-http,
-- neon-serverless, pglite: PgPreparedSession.queryWithCache) in a
-- DrizzleQueryError whose message starts "Failed query:" and ends with the
-- params, so this matches every row that can hold query values. Other errors
-- (our ToolError refusals, a missing camp row) are our own sentences.
UPDATE "mcp_audit_log"
   SET "error_message" = 'DrizzleQueryError'
 WHERE "error_message" LIKE 'Failed query:%';
--> statement-breakpoint
-- 2. Members already erased: their arguments and error text go, as erasure
-- now does.
UPDATE "mcp_audit_log" AS l
   SET "args_json" = NULL, "error_message" = NULL
  FROM "users" AS u
 WHERE u."id" = l."user_id"
   AND u."sanitised" = true
   AND (l."args_json" IS NOT NULL OR l."error_message" IS NOT NULL);
