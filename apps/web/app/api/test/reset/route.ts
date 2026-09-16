import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resetDatabaseForE2E } from "@camp404/db/e2e";
import {
  isE2ETestMode,
  TEST_USER_COOKIE,
  usesTestStore,
} from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Resets the test data between specs: the in-memory store, or the local
// database in the real-database run. Use in `beforeEach`.

export const runtime = "nodejs";

export async function POST() {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // The real-database run empties the local stack instead of the store.
  if (usesTestStore()) testStore.reset();
  else await resetDatabaseForE2E();
  const cookieStore = await cookies();
  cookieStore.delete(TEST_USER_COOKIE);
  return NextResponse.json({ ok: true });
}
