"use server";

import { redirect } from "next/navigation";
import { canLeaveCamp } from "@camp404/core";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { countActiveCaptains } from "@/lib/bootstrap";
import {
  ensureCampUser,
  hasCampAccess,
  setDisplayName,
  setProfileImage,
} from "@/lib/users";
import { deleteAccount } from "@/lib/account";

export type UpdateProfileResult = { ok: false; error: string };
export type DeleteAccountResult = { ok: false; error: string };

const MAX_NAME_LENGTH = 80;

/**
 * Persist edits from the profile editor: display name and profile photo
 * URL (the image itself is already uploaded to Blob via the avatar
 * uploader; we only store the returned URL here). Redirects to /profile on
 * success; returns an error object otherwise so the form can surface it.
 */
export async function updateProfile(
  _prev: UpdateProfileResult | null,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  const rawName = formData.get("displayName");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, error: "Display name can't be empty." };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Display name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  const rawImage = formData.get("profileImageUrl");
  const image = typeof rawImage === "string" ? rawImage.trim() : "";

  await setDisplayName(campUser.id, name);
  await setProfileImage(campUser.id, image.length > 0 ? image : null);

  redirect("/profile");
}

/**
 * Permanently erase the signed-in member's account — anonymise to a "Lost Cat"
 * stub and remove their personal data (irreversible). Requires the typed DELETE
 * confirmation; on success the auth session is ended via the sign-out route.
 */
export async function deleteOwnAccount(
  _prev: DeleteAccountResult | null,
  formData: FormData,
): Promise<DeleteAccountResult> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (formData.get("confirm") !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm." };
  }
  // The camp must never lose its last captain — /setup latches shut after
  // bootstrap and there is no demotion or CLI rescue path, so this is
  // unrecoverable. Checked at the moment of erasure, not at page render.
  const guard = canLeaveCamp({
    isCaptain: campUser.rank === "captain",
    captainCount: await countActiveCaptains(),
  });
  if (!guard.ok) {
    return {
      ok: false,
      error:
        "You're the last captain — promote another member to captain before erasing your account.",
    };
  }
  await deleteAccount(campUser.id);
  redirect("/auth/sign-out");
}
