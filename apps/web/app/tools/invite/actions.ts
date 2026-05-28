"use server";

import { createInviteCode, findInviteCodeByCode } from "@camp404/db/invite-codes";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import {
  generateInviteCode,
  isSyntacticallyValidCode,
} from "@/lib/invite-words";

export type CreateInviteResult =
  | {
      ok: true;
      code: string;
      invitedEmail: string;
    }
  | {
      ok: false;
      error: string;
    };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mint a single-use, member-tier invite code from inside the app.
 *
 * Auth-gated to any signed-in camp member (anyone past the invite
 * gate). Always sets `assigned_rank = NULL` — captain-tier codes can
 * ONLY be minted from the CLI. The current user is recorded as the
 * inviter, so the family-tree page can attribute the relationship.
 *
 * Validates everything server-side: email format, code syntax, code
 * uniqueness. The /api/tools/invite/check endpoint is a UX
 * convenience; this is the security boundary.
 */
export async function createInviteAction(
  _prev: CreateInviteResult | null,
  formData: FormData,
): Promise<CreateInviteResult> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };

  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }

  const emailRaw =
    typeof formData.get("email") === "string"
      ? (formData.get("email") as string)
      : "";
  const noteRaw =
    typeof formData.get("note") === "string"
      ? (formData.get("note") as string)
      : "";
  const codeRaw =
    typeof formData.get("code") === "string"
      ? (formData.get("code") as string)
      : "";

  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const note = noteRaw.trim() || null;

  // Code: either user-supplied or auto-generated. Either way we re-check
  // availability before insert; the unique-PK on `code` is the final
  // backstop if two redeemers race for the same name.
  let code = codeRaw.trim().toLowerCase();
  if (code) {
    if (!isSyntacticallyValidCode(code)) {
      return {
        ok: false,
        error: "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.",
      };
    }
    const existing = await findInviteCodeByCode(code);
    if (existing) {
      return { ok: false, error: `'${code}' is already taken.` };
    }
  } else {
    code = await generateUnusedCode();
  }

  try {
    await createInviteCode({
      code,
      createdByUserId: campUser.id,
      note,
      maxUses: 1,
      assignedRank: null,
      invitedEmail: email,
    });
  } catch {
    // Unique-PK collision (race with another redeemer) or any other DB
    // error. Don't leak details; tell the user to try again.
    return { ok: false, error: "Couldn't save invite. Try a different code." };
  }

  return { ok: true, code, invitedEmail: email };
}

async function generateUnusedCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateInviteCode();
    const existing = await findInviteCodeByCode(candidate);
    if (!existing) return candidate;
  }
  // Astronomically unlikely after 8 retries against a small DB — but if
  // we ever get here, fall back to a timestamp suffix.
  return `${generateInviteCode()}-${Date.now().toString(36)}`;
}
