import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isE2ETestMode, TEST_USER_COOKIE } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { INVITE_COOKIE } from "@/lib/access-control";

// Resets the in-memory test store between specs. Use in `beforeEach`.

export const runtime = "nodejs";

export async function POST() {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  testStore.reset();
  const cookieStore = await cookies();
  cookieStore.delete(TEST_USER_COOKIE);
  cookieStore.delete(INVITE_COOKIE);
  return NextResponse.json({ ok: true });
}
