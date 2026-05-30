import { NextResponse } from "next/server";
import { z } from "zod";
import { acknowledgeDelivery } from "@/lib/notifications";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

export const runtime = "nodejs";

// Dismisses one full-screen notification on the member's behalf. Scoped to
// the caller inside the query, so a member can only acknowledge their own
// deliveries.

const Body = z.object({ deliveryId: z.string().uuid() });

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const campUser = await ensureCampUser(user);
  // No camp access → synthetic empty id; never query with it (would 500).
  if (!hasCampAccess(campUser, user.primaryEmail)) {
    return NextResponse.json({ ok: false });
  }
  const ok = await acknowledgeDelivery({
    deliveryId: parsed.data.deliveryId,
    userId: campUser.id,
  });
  return NextResponse.json({ ok });
}
