import { NextResponse } from "next/server";
import { findInviteCodeByCode } from "@camp404/db/invite-codes";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { rateLimiter } from "@/lib/rate-limit";
import {
  CODE_RULES_HINT,
  isSyntacticallyValidCode,
  normalizeInviteCode,
} from "@/lib/invite-words";
import { usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

export const runtime = "nodejs";

// GitHub-style availability check for invite codes. Called from
// /tools/invite as the user types, so it has the same gate as that page:
// signed in, camp access, approved. Sign-up is open, so a signed-in account
// alone is not a member. Without the camp gates, anyone could sign up and use
// this to test whether a guessed code exists, and then redeem it.

export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const campUser = await ensureCampUser(user);
  if (
    !hasCampAccess(campUser, user.primaryEmail) ||
    !isApproved(campUser, user.primaryEmail)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Throttle the existence oracle so a signed-in account can't enumerate codes.
  const limited = await rateLimiter.limit(`invite-check:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(limited.retryAfterSeconds) },
      },
    );
  }

  const url = new URL(req.url);
  const raw = normalizeInviteCode(url.searchParams.get("code") ?? "");

  if (!raw) {
    return NextResponse.json({
      available: false,
      reason: "empty",
      hint: CODE_RULES_HINT,
    });
  }
  if (!isSyntacticallyValidCode(raw)) {
    return NextResponse.json({
      available: false,
      reason: "invalid",
      hint: CODE_RULES_HINT,
    });
  }

  const existing = usesTestStore()
    ? testStore.findUsableInviteCode(raw) ?? null
    : await findInviteCodeByCode(raw);

  if (existing) {
    return NextResponse.json({ available: false, reason: "taken" });
  }
  return NextResponse.json({ available: true });
}
