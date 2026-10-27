import "server-only";

import * as db from "@camp404/db/telegram-posts";
import { telegramBotUsername } from "./telegram";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Where Ol' Jeb posts camp news, and what he posts (Camp settings' Ol' Jeb
// card). From the database or, under E2E, the test store, picked once (twin);
// lib/__tests__/telegram-agreement.test.ts holds the two sides equal.
// `/notifyhere` itself arrives at the webhook, which writes through
// @camp404/db/telegram-posts.

const places = twin(db, testStore, [
  "listTelegramPlaces",
  "getTelegramPostSettings",
  "setTelegramPostSettings",
  "removeTelegramPlace",
  "addTelegramPlace",
  "postTeamLeadInTelegram",
]);

export type {
  TelegramPlace,
  TelegramPostSettings,
} from "@camp404/db/telegram-posts";

export const listTelegramPlaces = places.listTelegramPlaces;
export const getTelegramPostSettings = places.getTelegramPostSettings;
export const setTelegramPostSettings = places.setTelegramPostSettings;
export const removeTelegramPlace = places.removeTelegramPlace;
/** A captain's "Tell the camp on Telegram" after making someone a lead. */
export const postTeamLeadInTelegram = places.postTeamLeadInTelegram;
/** For the E2E `/notifyhere` stand-in; the webhook writes the real one. */
export const addTelegramPlace = places.addTelegramPlace;

/**
 * Whether to offer "Tell the camp on Telegram" after a lead is made: Ol' Jeb
 * is set up and posts in at least one camp chat.
 */
export async function mayOfferLeadPost(): Promise<boolean> {
  if (telegramBotUsername() === null) return false;
  return (await listTelegramPlaces()).length > 0;
}
