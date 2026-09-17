import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { upsertE2EAuthUser } from "@camp404/db/e2e";
import {
  isE2ETestMode,
  TEST_USER_COOKIE,
  usesTestStore,
} from "@/lib/test-mode";

// E2E test-only login. Sets the `camp404_test_user` cookie that
// `getAuthenticatedUser()` reads instead of consulting Stack. Returns 404
// when E2E_TEST_MODE isn't set so production never exposes this route.

export const runtime = "nodejs";

interface LoginBody {
  id?: string;
  email?: string;
  displayName?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as LoginBody;
  const user = {
    id: body.id ?? `test-stack-${Date.now()}`,
    primaryEmail: body.email ?? null,
    displayName: body.displayName ?? body.email ?? null,
  };

  // In the real-database run, give the login the sign-in record Neon Auth
  // would hold, so reads that join a member's email find it.
  if (!usesTestStore()) {
    await upsertE2EAuthUser({ id: user.id, email: user.primaryEmail });
  }

  const cookieStore = await cookies();
  cookieStore.set(TEST_USER_COOKIE, encodeURIComponent(JSON.stringify(user)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return NextResponse.json({ ok: true, user });
}

export async function DELETE() {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cookieStore = await cookies();
  cookieStore.delete(TEST_USER_COOKIE);
  return NextResponse.json({ ok: true });
}
