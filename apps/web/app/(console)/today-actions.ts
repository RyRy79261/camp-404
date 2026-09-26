"use server";

import { prefetchMemberState, resolveMemberState } from "@/lib/member-gate";
import { getTodayModel, type TodayModel } from "@/lib/today";

/**
 * The Today gadget's contents, fresh, for the member asking: read each time
 * the gadget opens, since the layout that drew it first is not drawn again as
 * the member moves between windows. Their own facts only; null for anyone
 * the desktop does not draw.
 */
export async function refreshTodayAction(): Promise<TodayModel | null> {
  // The member's plain reads (their row, teams, the settings) start at once,
  // so Today's own reads overlap the gate instead of waiting behind it.
  prefetchMemberState();
  const state = await resolveMemberState();
  return getTodayModel(state);
}
