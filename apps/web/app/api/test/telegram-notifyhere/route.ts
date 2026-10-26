import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Stands in for a member sending `/notifyhere` in a Telegram group or topic:
// as the webhook would, it adds the chat as a place Ol' Jeb posts camp news,
// for a captain who connected Telegram only (the member's Telegram id is the
// one the telegram-start stand-in gave them). Test store only.

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
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
  const result = testStore.addTelegramPlace({
    telegramUserId: `e2e-${user.id}`,
    chatId: body.chatId,
    threadId: body.threadId ?? null,
    title: body.title ?? "Telegram chat",
    username: null,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
