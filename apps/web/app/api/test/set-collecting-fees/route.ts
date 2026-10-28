import { NextResponse } from "next/server";
import { z } from "zod";
import { getDuesYear, setCollectingFees } from "@/lib/dues";
import { ledgerCycle } from "@/lib/payments";
import { isE2ETestMode } from "@/lib/test-mode";
import { findCampUserByAuthId } from "@/lib/users";

// Turns the year's "Collecting fees" switch on or off for a spec, as the
// given captain or Finance lead (the write re-checks MONEY_KEEPER itself), so
// the member side (the pay guide) can be driven before the Finance screens
// that flip it are on the page. Mirrors /api/test/seed-participation.

export const runtime = "nodejs";

const Body = z.object({
  authUserId: z.string().min(1),
  on: z.boolean(),
});

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "authUserId and on (a boolean) are required" },
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
  const cycle = await ledgerCycle();
  const year = await getDuesYear(cycle);
  const result = await setCollectingFees({
    cycle,
    on: body.data.on,
    expectedVersion: year.version,
    actorId: user.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
