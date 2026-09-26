import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Gives a test user a lift this year: their own car (`role: "driver"`), or a
// seat in another test user's car (`role: "rider"`, with the driver's
// authUserId), so a spec can drive the home page's lift card and the My lift
// program. Both user rows must already exist (created on their first page
// load). Mirrors /api/test/seed-team.
//
// Test store only: the local-database E2E run seeds lifts through the db
// factories, and a lift is not written from any app screen a spec could use.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  role?: "driver" | "rider";
  /** For a rider: the authUserId of the driver whose car they sit in. */
  driverAuthUserId?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  seatsOffered?: number;
  departureCity?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.authUserId || (body.role !== "driver" && body.role !== "rider")) {
    return NextResponse.json(
      { error: "authUserId and role (driver|rider) required" },
      { status: 400 },
    );
  }
  const user = await findCampUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.authUserId}` },
      { status: 404 },
    );
  }
  if (body.role === "driver") {
    testStore.seedDriverProfile({
      userId: user.id,
      vehicleMake: body.vehicleMake ?? null,
      vehicleModel: body.vehicleModel ?? null,
      seatsOffered: body.seatsOffered ?? null,
      departureCity: body.departureCity ?? null,
    });
    return NextResponse.json({ ok: true });
  }
  const driver = body.driverAuthUserId
    ? await findCampUserByAuthId(body.driverAuthUserId)
    : null;
  if (!driver) {
    return NextResponse.json(
      { error: "A rider needs the driverAuthUserId of an existing user" },
      { status: 400 },
    );
  }
  testStore.seedCarRider({ driverUserId: driver.id, memberUserId: user.id });
  return NextResponse.json({ ok: true });
}
