import { NextResponse } from "next/server";
import { createInviteCode } from "@camp404/db/invite-codes";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Seeds an invite code: into the in-memory store, or into the local database
// in the real-database run. Used by Playwright
// specs that need to verify DB-backed (rather than env-bootstrap) codes.

export const runtime = "nodejs";

interface SeedBody {
  code: string;
  createdByUserId?: string;
  note?: string;
  maxUses?: number;
  expiresAt?: string;
  assignedRank?: "captain" | "member";
  requiresApproval?: boolean;
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<SeedBody>;
  if (typeof body.code !== "string" || !body.code) {
    return NextResponse.json(
      { error: "code is required" },
      { status: 400 },
    );
  }
  const input = {
    code: body.code,
    createdByUserId: body.createdByUserId ?? null,
    note: body.note ?? null,
    maxUses: body.maxUses ?? null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    assignedRank: body.assignedRank ?? null,
    requiresApproval: body.requiresApproval ?? false,
  };
  // The real-database run writes the invite_codes row itself.
  const row = usesTestStore()
    ? testStore.seedInviteCode(input)
    : await createInviteCode({
        ...input,
        createdByUserId: input.createdByUserId ?? null,
      });
  return NextResponse.json({ ok: true, inviteCode: row });
}
