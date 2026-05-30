"use server";

import { revalidatePath } from "next/cache";
import { ComposeAnnouncementInput } from "@camp404/types";
import {
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  publishAnnouncement,
  updateAnnouncementDraft,
} from "@/lib/notifications";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Captain-gate every announcement action at the data layer. Returns the
 * acting captain's id, or an error string for the caller to surface — the
 * same pattern as camp-management's `requireCaptain`.
 */
async function requireCaptain(): Promise<
  { ok: true; captainId: string } | { ok: false; error: string }
> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  if (campUser.rank !== "captain") {
    return { ok: false, error: "Captain access only." };
  }
  return { ok: true, captainId: campUser.id };
}

/** Save a new announcement draft. */
export async function saveDraftAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  const parsed = ComposeAnnouncementInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const { id } = await createAnnouncementDraft({
    senderId: gate.captainId,
    ...parsed.data,
  });
  revalidatePath("/captains/announcements");
  return { ok: true, data: { id } };
}

/** Edit an existing draft (author-only, drafts only). */
export async function updateDraftAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  const parsed = ComposeAnnouncementInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const ok = await updateAnnouncementDraft({
    id,
    senderId: gate.captainId,
    ...parsed.data,
  });
  if (!ok) {
    return { ok: false, error: "Draft not found or already published." };
  }
  revalidatePath("/captains/announcements");
  return { ok: true };
}

/** Delete a draft (author-only, drafts only). */
export async function deleteDraftAction(id: string): Promise<ActionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  const ok = await deleteAnnouncementDraft({ id, senderId: gate.captainId });
  if (!ok) {
    return { ok: false, error: "Draft not found or already published." };
  }
  revalidatePath("/captains/announcements");
  return { ok: true };
}

/**
 * Publish a draft to the whole camp. Fans the announcement out to every
 * member except the author and returns how many recipients it reached.
 */
export async function publishAction(
  id: string,
): Promise<ActionResult<{ recipientCount: number }>> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  const result = await publishAnnouncement({ id, senderId: gate.captainId });
  if (!result.ok) return result;
  revalidatePath("/captains/announcements");
  return { ok: true, data: { recipientCount: result.recipientCount } };
}
