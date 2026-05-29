import { NextResponse } from "next/server";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Seeds an entry into the in-memory invite_codes store. Used by Playwright
// specs that need to verify DB-backed (rather than env-bootstrap) codes.

export const runtime = "nodejs";

interface SeedBody {
  code: string;
  createdByUserId?: string;
  note?: string;
  maxUses?: number;
  expiresAt?: string;
  assignedRank?: "captain" | "member";
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
  const row = testStore.seedInviteCode({
    code: body.code,
    createdByUserId: body.createdByUserId ?? null,
    note: body.note ?? null,
    maxUses: body.maxUses ?? null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    assignedRank: body.assignedRank ?? null,
  });
  return NextResponse.json({ ok: true, inviteCode: row });
}
