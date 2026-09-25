import { APP_LABELS, INKBLOT } from "./content";
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
  inkblot: { w: 720, h: 560 },
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

// The secret programs: openable, never listed.
const SECRET_APPS: readonly AppDef[] = [
  { id: "inkblot", label: INKBLOT.title, size: SIZES.inkblot },
];

export function appById(id: AppId): AppDef {
  return [...APPS, ...SECRET_APPS].find((a) => a.id === id)!;
}
