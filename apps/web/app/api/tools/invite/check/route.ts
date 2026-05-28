import { NextResponse } from "next/server";
import { findInviteCodeByCode } from "@camp404/db/invite-codes";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  CODE_RULES_HINT,
  isSyntacticallyValidCode,
} from "@/lib/invite-words";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

export const runtime = "nodejs";

// GitHub-style availability check for invite codes. Called from
// /tools/invite as the user types. Auth-gated (anonymous callers can't
// enumerate codes) but otherwise cheap — just a PK lookup.

export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const raw = (url.searchParams.get("code") ?? "").trim().toLowerCase();

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

  const existing = isE2ETestMode()
    ? testStore.findUsableInviteCode(raw) ?? null
    : await findInviteCodeByCode(raw);

  if (existing) {
    return NextResponse.json({ available: false, reason: "taken" });
  }
  return NextResponse.json({ available: true });
}
