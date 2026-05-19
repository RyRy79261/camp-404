import { handlers } from "@/lib/auth";

// Auth.js route handlers must run on Node.js (the Drizzle adapter uses
// Postgres drivers that aren't edge-compatible).
export const runtime = "nodejs";

export const { GET, POST } = handlers;
