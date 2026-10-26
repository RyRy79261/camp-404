import { NextResponse } from "next/server";
import { z } from "zod";
import { seedTelegramForE2E } from "@camp404/db/e2e";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { findCampUserByAuthId } from "@/lib/users";

// Gives a test user a Telegram username and, optionally, a connection to
// Ol' Jeb, so a spec can show who "Post in Telegram" may tag. Real-database
// run only: the store run connects through /api/test/telegram-start.

export const runtime = "nodejs";

const Body = z.object({
  authUserId: z.string().min(1),
  handle: z.string().nullable(),
  connected: z.boolean().default(false),
});

export async function POST(req: Request) {
  if (!isE2ETestMode() || usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "authUserId and handle are required" },
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
  await seedTelegramForE2E(user.id, {
    handle: body.data.handle,
    connected: body.data.connected,
  });
  return NextResponse.json({ ok: true });
}
