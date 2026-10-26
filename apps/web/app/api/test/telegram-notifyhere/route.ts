import { NextResponse } from "next/server";
import { seedTelegramForE2E } from "@camp404/db/e2e";
import { addTelegramPlace } from "@camp404/db/telegram-posts";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Stands in for a member sending `/notifyhere` in a Telegram group or topic:
// as the webhook would, it adds the chat as a place Ol' Jeb posts camp news,
// for a captain who connected Telegram only (the member's Telegram id is the
// one the telegram-start stand-in gave them). In the real-database run the
// captain is connected first (a Start tap is not modelled there).

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    authUserId?: string;
    chatId?: string;
    threadId?: string | null;
    title?: string;
  };
  if (!body.authUserId || !body.chatId) {
    return NextResponse.json(
      { error: "authUserId and chatId required" },
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
  const place = {
    telegramUserId: `e2e-${user.id}`,
    chatId: body.chatId,
    threadId: body.threadId ?? null,
    title: body.title ?? "Telegram chat",
    username: null,
  };
  let result;
  if (usesTestStore()) {
    result = testStore.addTelegramPlace(place);
  } else {
    await seedTelegramForE2E(user.id, { connected: true });
    result = await addTelegramPlace(place);
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
