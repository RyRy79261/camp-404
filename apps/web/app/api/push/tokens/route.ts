import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { registerPushToken, unregisterPushToken } from "@/lib/push";

export const runtime = "nodejs";

// Device push-token registry. POST upserts the caller's FCM token; DELETE
// removes one (owner-scoped) on web sign-out / native revoke. Same auth shape
// as /api/notifications/acknowledge.

const RegisterBody = z.object({
  token: z.string().min(1),
  platform: z.enum(["web", "ios", "android"]),
  topics: z.array(z.string()).optional(),
});

const DeleteBody = z.object({ token: z.string().min(1) });

async function gate(): Promise<
  | { ok: true; campUserId: string }
  | { ok: false; res: NextResponse }
> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const campUser = await ensureCampUser(user);
  if (!hasCampAccess(campUser, user.primaryEmail)) {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, campUserId: campUser.id };
}

export async function POST(req: Request) {
  const g = await gate();
  if (!g.ok) return g.res;
  const parsed = RegisterBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await registerPushToken({ userId: g.campUserId, ...parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await gate();
  if (!g.ok) return g.res;
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await unregisterPushToken(g.campUserId, parsed.data.token);
  return NextResponse.json({ ok: true });
}
