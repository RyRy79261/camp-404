"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { telegramBotUsername } from "@/lib/telegram";
import {
  createTelegramLinkCode,
  disconnectTelegram,
  getTelegramConnection,
  setTelegramNotices,
} from "@/lib/telegram-connection";

// The Profile's Telegram card (Ol' Jeb). Every write is the signed-in member's
// own: nobody connects, disconnects or sets another member's notices.

const NOT_SET_UP = "Telegram isn't set up for the camp yet.";

/** A fresh one-use link to Ol' Jeb, for the member's own account. */
export async function createTelegramLinkAction(): Promise<
  ActionResult<{ link: string }>
> {
  return runAction("createTelegramLinkAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const bot = telegramBotUsername();
    if (!bot) return { ok: false, error: NOT_SET_UP };
    const code = await createTelegramLinkCode(gate.campUser.id);
    return {
      ok: true,
      data: { link: `https://t.me/${bot}?start=${encodeURIComponent(code)}` },
    };
  });
}

/** Whether the member's Telegram is connected now (the Waiting state polls). */
export async function telegramConnectedAction(): Promise<
  ActionResult<{ connected: boolean }>
> {
  return runAction("telegramConnectedAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const { connected } = await getTelegramConnection(gate.campUser.id);
    if (connected) revalidatePath("/profile");
    return { ok: true, data: { connected } };
  });
}

export async function disconnectTelegramAction(): Promise<ActionResult> {
  return runAction("disconnectTelegramAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    await disconnectTelegram(gate.campUser.id);
    revalidatePath("/profile");
    return { ok: true };
  });
}

const Notices = z.enum(["all", "important"]);

export async function setTelegramNoticesAction(
  notices: string,
): Promise<ActionResult> {
  return runAction("setTelegramNoticesAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = Notices.safeParse(notices);
    if (!parsed.success)
      return { ok: false, error: "Pick one of the options." };
    await setTelegramNotices(gate.campUser.id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  });
}
