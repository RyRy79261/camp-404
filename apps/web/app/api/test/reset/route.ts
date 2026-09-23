import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resetDatabaseForE2E } from "@camp404/db/e2e";
import {
  isE2ETestMode,
  TEST_USER_COOKIE,
  usesTestStore,
} from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { resetRateLimitsForE2E } from "@/lib/rate-limit";

// Resets the test data between specs: the in-memory store, or the local
// database in the real-database run, and the in-memory rate-limit buckets. Use in `beforeEach`.

export const runtime = "nodejs";

export async function POST() {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // The real-database run empties the local stack instead of the store.
  if (usesTestStore()) testStore.reset();
  else await resetDatabaseForE2E();
  // Every spec comes from one address, so the per-IP buckets would otherwise
  // drain across the whole run.
  resetRateLimitsForE2E();
  const cookieStore = await cookies();
  cookieStore.delete(TEST_USER_COOKIE);
  return NextResponse.json({ ok: true });
}
