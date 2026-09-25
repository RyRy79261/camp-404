// Join's programs: the keys its windows are opened by. The window engine
// itself (stacking, cascade, drag and resize rules) is @camp404/os's
// wmReducer, shared with the console.

import type { OsWindow } from "@camp404/os";

export const APP_IDS = [
  "readme",
  "teams",
  "gifts",
  "map",
  "crew",
  "schedule",
  "fee",
  "perks",
  "truck",
  "terminal",
  "apply",
] as const;

/** Programs with no desktop icon and no Start menu entry: found, not shown. */
export const SECRET_APP_IDS = ["inkblot"] as const;

export type AppId = (typeof APP_IDS)[number] | (typeof SECRET_APP_IDS)[number];

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}

export type JoinWindow = OsWindow<AppId>;
