import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Picks up `pending` recipes, runs them through Claude Opus structured-output
 * normalisation, and writes the result back. Scheduled in vercel.json every
 * 15 minutes during the planning window.
 *
 * Stub for Phase 0 — full implementation lands in Phase 3 (Recipes & meal planning).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json({ ok: true, processed: 0 });
}
