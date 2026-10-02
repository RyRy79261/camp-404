"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { removeReportScreenshot } from "@/lib/report-screenshots";

/**
 * A captain deletes a bug report's screenshot (#313). Captains only; the row
 * and its audit receipt go in one transaction, then the picture. The GitHub
 * issue stays: it never held the picture.
 */
export async function deleteReportScreenshotAction(
  id: string,
): Promise<ActionResult> {
  return runAction("deleteReportScreenshotAction", async () => {
    const gate = await captainActionGate(
      "captain",
      "Only captains can delete a report's screenshot.",
    );
    if (!gate.ok) return gate;
    if (typeof id !== "string") return { ok: false, error: "Reload the page." };
    const result = await removeReportScreenshot({
      id,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath("/captains/report-screenshots");
    return { ok: true };
  });
}
