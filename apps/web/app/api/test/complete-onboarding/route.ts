import { NextResponse } from "next/server";
import { isE2ETestMode } from "@/lib/test-mode";
import type { EmergencyContact } from "@camp404/types";
import {
  findCampUserByAuthId,
  satisfyBurnerProfileAction,
  setEmergencyContacts,
  setIdDocuments,
  upsertBurnerProfile,
} from "@/lib/users";

// Marks a test user's burner-profile onboarding complete, so specs can reach
// the post-onboarding gates (home, /pending-approval) without walking the
// questionnaire UI — that walk is covered at the component layer in
// `components/__tests__/runner.test.tsx`. The user row must already exist
// (created lazily on their first authenticated page load). Goes through the
// lib/users facades, so it writes the store or, in the real-database run, the
// local database.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  /** Optional ID document, stored encrypted as the real profile save does. */
  idType?: "sa_id" | "passport";
  idNumber?: string;
  /** Optional emergency contacts, as the profile's safety page saves them. */
  emergencyContacts?: EmergencyContact[];
  /** Optional country answer (ISO alpha-2), for the roster's Country. */
  country?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.authUserId) {
    return NextResponse.json(
      { error: "authUserId is required" },
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
  await upsertBurnerProfile({
    userId: user.id,
    version: "e2e-test",
    responses: body.country ? { country: body.country } : {},
    markComplete: true,
  });
  if (body.idType && body.idNumber) {
    await setIdDocuments(user.id, {
      idType: body.idType,
      idNumber: body.idNumber,
    });
  }
  if (body.emergencyContacts?.length) {
    await setEmergencyContacts(user.id, body.emergencyContacts);
  }
  // Finishing the profile satisfies its gate, as the real save does.
  await satisfyBurnerProfileAction(user.id);
  return NextResponse.json({ ok: true });
}
