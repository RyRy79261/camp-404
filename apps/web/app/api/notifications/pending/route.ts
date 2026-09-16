import { NextResponse } from "next/server";
import {
  countUnseenPopups,
  getPendingAcknowledgements,
} from "@/lib/notifications";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The acknowledge gate polls this on every authenticated load (and on an
// interval) to discover full-screen notifications the member still has to
// acknowledge, and how many pop-ups wait to be shown (it claims those from
// /api/notifications/popups only when there are some). Unauthenticated callers
// get an empty answer, not a 401 — the gate mounts app-wide, including on the
// public landing page.

const NOTHING = { pending: [], popups: 0 };

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(NOTHING);
  }
  const campUser = await ensureCampUser(user);
  // ensureCampUser hands back a synthetic id:"" row for a signed-in user with
  // no camp access yet; querying with that empty id 500s on a real DB. They
  // have no deliveries anyway, so return the same empty list as anon callers.
  if (!hasCampAccess(campUser, user.primaryEmail)) {
    return NextResponse.json(NOTHING);
  }
  // The full-screen takeover is for camp members. A pending or rejected
  // applicant still reads their inbox, but nothing takes over their screen
  // (owner's call, 2026-09-16: camp-wide messages are approved members only).
  if (!isApproved(campUser, user.primaryEmail)) {
    return NextResponse.json(NOTHING);
  }
  const [pending, popups] = await Promise.all([
    getPendingAcknowledgements(campUser.id),
    countUnseenPopups(campUser.id),
  ]);
  return NextResponse.json({ pending, popups });
}
