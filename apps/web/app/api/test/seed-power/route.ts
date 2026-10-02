import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { seedPowerExample } from "@/lib/test-store-power-seed";
import { findCampUserByAuthId } from "@/lib/users";

// Fills this year's Power plan in the E2E test store with a camp's worth of
// realistic rows (lib/test-store-power-seed.ts), so a spec or a screenshot
// run can open every Power section without driving a dozen dialogs. The rows
// are written as `authUserId`, who must already be a Power & Lighting lead or
// a captain. Test store only: 404 anywhere else.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  /** Drivers' authUserIds, in order: the example's fuel cans go on their cars. */
  cars?: string[];
  /** The plan's day 1, YYYY-MM-DD. */
  firstPoweredDay?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const user = body.authUserId
    ? await findCampUserByAuthId(body.authUserId)
    : null;
  if (!user) {
    return NextResponse.json(
      { error: "authUserId of an existing user is required" },
      { status: 400 },
    );
  }
  const cars: string[] = [];
  for (const authUserId of body.cars ?? []) {
    const driver = await findCampUserByAuthId(authUserId);
    if (!driver) {
      return NextResponse.json(
        { error: `no user ${authUserId} for a car` },
        { status: 400 },
      );
    }
    cars.push(driver.id);
  }
  try {
    seedPowerExample(user.id, {
      cars,
      firstPoweredDay: body.firstPoweredDay ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
