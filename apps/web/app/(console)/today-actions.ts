"use server";

import { resolveMemberState } from "@/lib/member-gate";
import { getTodayModel, type TodayModel } from "@/lib/today";

/**
 * The Today gadget's contents, fresh, for the member asking: read each time
 * the gadget opens, since the layout that drew it first is not drawn again as
 * the member moves between windows. Their own facts only; null for anyone
 * the desktop does not draw.
 */
export async function refreshTodayAction(): Promise<TodayModel | null> {
  const state = await resolveMemberState();
  return getTodayModel(state);
}
