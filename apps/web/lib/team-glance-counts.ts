import "server-only";

import * as db from "@camp404/db/team-glance";
import type { SafetyCounts, TelegramReach } from "@camp404/db/team-glance";
import { teamGlanceTestStore } from "./test-store-team-glance";
import { twin } from "./twin";

// The counts behind the Safety and Communications & HR team panels, from
// @camp404/db/team-glance or, under E2E, its twin. Counts only. The Safety
// counts check their reader themselves (SAFETY_COUNTS_READER); the caller
// gates Ol' Jeb's reach (TELEGRAM_REACH_READER) before it asks.
// lib/__tests__/team-glance-agreement.test.ts holds the two sides equal.

export type { SafetyCounts, TelegramReach };

const counts = twin(db, teamGlanceTestStore, [
  "getSafetyCountsFor",
  "countTelegramReach",
  "countAnnouncementsSince",
]);

export const getSafetyCountsFor = counts.getSafetyCountsFor;
export const countTelegramReach = counts.countTelegramReach;
export const countAnnouncementsSince = counts.countAnnouncementsSince;
