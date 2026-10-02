import { NextResponse } from "next/server";
import { z } from "zod";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { dailySheetTestStore } from "@/lib/test-store-daily-sheet";
import { findCampUserByAuthId } from "@/lib/users";

// Gives a test user allergy facts, so a spec can show the daily site sheet's
// allergy line without driving the dietary questionnaire (which the in-memory
// store does not model). Test store only. Mirrors /api/test/seed-team. The
// user row must already exist (created on their first page load).

export const runtime = "nodejs";

const Body = z.object({
  authUserId: z.string().min(1),
  allergies: z.string().max(200).nullable(),
  isAnaphylactic: z.boolean().default(false),
});

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "authUserId and allergies are required" },
      { status: 400 },
    );
  }
  const user = await findCampUserByAuthId(body.data.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.data.authUserId}` },
      { status: 404 },
    );
  }
  dailySheetTestStore.seedAllergy(user.id, {
    allergies: body.data.allergies,
    isAnaphylactic: body.data.isAnaphylactic,
  });
  return NextResponse.json({ ok: true });
}
