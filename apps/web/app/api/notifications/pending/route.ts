import { NextResponse } from "next/server";
import { getPendingAcknowledgements } from "@camp404/db/broadcasts";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The acknowledge gate polls this on every authenticated load (and on an
// interval) to discover full-screen notifications the member still has to
// acknowledge. Unauthenticated callers get an empty list, not a 401 — the
// gate mounts app-wide, including on the public landing page.

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ pending: [] });
  }
  const campUser = await ensureCampUser(user);
  const pending = await getPendingAcknowledgements(campUser.id);
  return NextResponse.json({ pending });
}
