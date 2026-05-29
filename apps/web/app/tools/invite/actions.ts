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
      maxUses: number;
      requiresApproval: boolean;
    }
  | {
      ok: false;
      error: string;
    };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A captain can mint a code for many redeemers; cap it so a typo can't
// create an effectively unlimited code by accident.
const MAX_USES_LIMIT = 100;

/**
 * Mint an invite code from inside the app.
 *
 * Auth-gated to any signed-in camp member (anyone past the invite gate).
 * Always sets `assigned_rank = NULL` — captain-tier codes can ONLY be minted
 * from the CLI. The current user is recorded as the inviter, so the
 * family-tree page can attribute the relationship.
 *
 * Captain vetting:
 *   - A non-captain's codes ALWAYS require captain approval (the redeemer
 *     lands in the vetting queue) and stay single-use, tied to one email.
 *   - A captain may pre-approve the redeemer (skip vetting) and raise the
 *     use cap to hand the code to several people.
 *
 * Validates everything server-side: email format, code syntax, code
 * uniqueness, captain-only options. The /api/tools/invite/check endpoint is a
 * UX convenience; this is the security boundary.
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
  const isCaptain = campUser.rank === "captain";

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

  // Captain-only knobs. A non-captain can't pre-approve anyone or mint a
  // multi-use code — the form never shows the controls, and we re-enforce
  // here so a crafted POST can't bypass it.
  const preApprove = isCaptain && formData.get("preApprove") === "on";
  const requiresApproval = !preApprove;

  let maxUses = 1;
  if (isCaptain) {
    const raw = formData.get("maxUses");
    if (typeof raw === "string" && raw.trim()) {
      const parsed = Number(raw.trim());
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_USES_LIMIT) {
        return {
          ok: false,
          error: `Max uses must be a whole number between 1 and ${MAX_USES_LIMIT}.`,
        };
      }
      maxUses = parsed;
    }
  }

  // The email targets a single person, so it's only meaningful (and required)
  // for a single-use code. A captain minting a multi-use code may leave it
  // blank; if they fill it in we still record it as the lead recipient.
  const email = emailRaw.trim().toLowerCase();
  const emailRequired = maxUses === 1;
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (emailRequired && !email) {
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
      maxUses,
      assignedRank: null,
      invitedEmail: email || null,
      requiresApproval,
    });
  } catch {
    // Unique-PK collision (race with another redeemer) or any other DB
    // error. Don't leak details; tell the user to try again.
    return { ok: false, error: "Couldn't save invite. Try a different code." };
  }

  return { ok: true, code, invitedEmail: email, maxUses, requiresApproval };
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
