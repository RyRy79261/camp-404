"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { JoinPageSave } from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { saveJoinPage, unpublishJoinPage } from "@/lib/join-page";

// The join page's writes (#264): captains only. Each action: the gate, the Zod
// boundary, then the write with the actor's id alone. The gate answers the
// screen; the rank is checked again inside the write's own transaction.
//
// The join site is its own deployment and reads the database on every visit,
// so there is nothing of it to revalidate from here.

const JOIN_PAGE_PATH = "/captains/camp-settings/join-page";

export async function saveJoinPageAction(
  input: JoinPageSave,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveJoinPageAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;
    const parsed = JoinPageSave.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error:
          parsed.error.issues[0]?.message ??
          "Check the join page and try again.",
      };
    }
    const result = await saveJoinPage({
      actorId: gate.campUser.id,
      ...parsed.data,
    });
    if (!result.ok) return result;
    revalidatePath(JOIN_PAGE_PATH);
    return { ok: true as const, data: { version: result.version } };
  });
}

const ExpectedVersion = z.number().int().min(1);

export async function unpublishJoinPageAction(
  expectedVersion: number,
): Promise<ActionResult<{ version: number }>> {
  return runAction("unpublishJoinPageAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;
    const parsed = ExpectedVersion.safeParse(expectedVersion);
    if (!parsed.success) {
      return { ok: false as const, error: "The join page is not published." };
    }
    const result = await unpublishJoinPage({
      actorId: gate.campUser.id,
      expectedVersion: parsed.data,
    });
    if (!result.ok) return result;
    revalidatePath(JOIN_PAGE_PATH);
    return { ok: true as const, data: { version: result.version } };
  });
}
