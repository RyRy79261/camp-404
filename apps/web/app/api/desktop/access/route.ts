import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getProgramManifest } from "@/lib/program-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The version of the signed-in member's manifest now, or null when they get
// no desktop. The console layout is not drawn again when the member moves
// between pages, so the desktop asks this on each new page and when the tab
// comes back, and refreshes when it is not the one it drew: a captain's
// approval or promotion then shows without a reload. A hash only; nothing the
// member may open is sent. A GET route, not a server action: Next runs a
// page's actions one at a time, so a check would queue behind (and in front
// of) a save. Never cached.

export async function GET() {
  // The answer is only a hash of the caller's own access, so a session is
  // guard enough; with none there is no desktop to keep up to date.
  if (!(await getAuthenticatedUser())) {
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const manifest = await getProgramManifest();
  return NextResponse.json(
    { version: manifest?.version ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
