"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  removeTelegramPlace,
  setTelegramPostSettings,
} from "@/lib/telegram-places";

// Camp settings' Ol' Jeb card: what he posts in the camp's Telegram chats,
// and taking a chat off his list. Captains only; each write checks the rank
// again inside its own transaction and is audited there.

const PAGE = "/captains/camp-settings";

const Settings = z.object({
  announcements: z.boolean(),
  reminders: z.boolean(),
  meetings: z.boolean(),
});

export async function setTelegramPostsAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("setTelegramPostsAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;
    const parsed = Settings.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Something went wrong. Please try again." };
    }
    const result = await setTelegramPostSettings({
      actorId: gate.campUser.id,
      settings: parsed.data,
    });
    if (result.ok) revalidatePath(PAGE);
    return result;
  });
}

export async function removeTelegramPlaceAction(
  id: unknown,
): Promise<ActionResult> {
  return runAction("removeTelegramPlaceAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) {
      return { ok: false, error: "Something went wrong. Please try again." };
    }
    const result = await removeTelegramPlace({
      actorId: gate.campUser.id,
      id: parsed.data,
    });
    if (result.ok) revalidatePath(PAGE);
    return result;
  });
}
