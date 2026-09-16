import { boolean, pgSchema, text } from "drizzle-orm/pg-core";

// Neon Auth keeps its users in the `neon_auth` schema of this same database
// (https://neon.com/docs/auth/authentication-flow). Camp 404 does not own or
// migrate these tables: this file is deliberately NOT part of schema.ts, so
// drizzle-kit never generates a migration for them. It declares only the
// columns the app reads.
//
// users.auth_user_id is neon_auth.user.id.

export const neonAuth = pgSchema("neon_auth");

export const neonAuthUsers = neonAuth.table("user", {
  id: text("id").primaryKey(),
  email: text("email"),
  emailVerified: boolean("emailVerified"),
});
