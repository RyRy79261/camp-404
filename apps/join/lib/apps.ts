import { APP_LABELS } from "./content";
import { APP_IDS, type AppId } from "./window-manager";

// Each program's opening size on a desktop. On a phone every window is full
// screen, so these only matter from the md breakpoint up.
const SIZES: Record<AppId, { w: number; h: number }> = {
  readme: { w: 560, h: 520 },
  teams: { w: 620, h: 560 },
  gifts: { w: 620, h: 620 },
  map: { w: 560, h: 480 },
  crew: { w: 560, h: 500 },
  schedule: { w: 600, h: 540 },
  fee: { w: 560, h: 560 },
  perks: { w: 560, h: 480 },
  truck: { w: 520, h: 360 },
  terminal: { w: 640, h: 400 },
  apply: { w: 460, h: 300 },
};

export type AppDef = {
  id: AppId;
  label: string;
  size: { w: number; h: number };
};

export const APPS: readonly AppDef[] = APP_IDS.map((id) => ({
  id,
  label: APP_LABELS[id],
  size: SIZES[id],
}));

export function appById(id: AppId): AppDef {
  return APPS.find((a) => a.id === id)!;
}
