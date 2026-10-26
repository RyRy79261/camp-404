import "server-only";

import * as db from "@camp404/db/telegram-dm";
import { testStore } from "./test-store";
import { twin } from "./twin";

// A member's own Telegram connection (Ol' Jeb, the camp's bot): the Profile's
// Telegram card reads and writes it here. From the database or, under E2E, the
// test store, picked once (twin); lib/__tests__/telegram-agreement.test.ts
// holds the two sides equal. `/start <code>` itself arrives at the webhook,
// which writes through @camp404/db/telegram-dm.

const connection = twin(db, testStore, [
  "getTelegramConnection",
  "createTelegramLinkCode",
  "disconnectTelegram",
  "setTelegramNotices",
  "connectTelegram",
]);

export const getTelegramConnection = connection.getTelegramConnection;
export const createTelegramLinkCode = connection.createTelegramLinkCode;
export const disconnectTelegram = connection.disconnectTelegram;
export const setTelegramNotices = connection.setTelegramNotices;
/** For the E2E "tap Start" stand-in; the webhook writes the real one. */
export const connectTelegram = connection.connectTelegram;
