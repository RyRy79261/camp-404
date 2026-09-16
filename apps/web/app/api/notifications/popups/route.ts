import { NextResponse } from "next/server";
import { notificationLink } from "@camp404/core";
import { claimPopups } from "@/lib/notifications";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claims the member's waiting pop-up notifications for the gate to show as
// toasts. A pop-up shows once, so claiming marks it read: call this only when
// the toast will actually be seen (a visible tab, no takeover on screen).
//
// A POST, because it changes state. The same members as the takeover: an
// applicant who is not approved yet gets nothing and nothing is claimed.

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const campUser = await ensureCampUser(user);
  if (
    !hasCampAccess(campUser, user.primaryEmail) ||
    !isApproved(campUser, user.primaryEmail)
  ) {
    return NextResponse.json({ popups: [] });
  }
  const claimed = await claimPopups(campUser.id);
  return NextResponse.json({
    popups: claimed.map((p) => ({
      deliveryId: p.deliveryId,
      title: p.title,
      body: p.body,
      link: notificationLink(p.refType, p.refId),
    })),
  });
}
