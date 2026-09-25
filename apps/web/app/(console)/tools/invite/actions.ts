"use server";

import { revalidatePath } from "next/cache";
import {
  createInviteCode,
  findInviteCodeByCode,
  revokeInviteCode,
} from "@camp404/db/invite-codes";
import { humanDuration } from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import { memberBlock, type MemberBlock } from "@/lib/member-gate";
import { rateLimiter } from "@/lib/rate-limit";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import {
  generateInviteCode,
  isSyntacticallyValidCode,
  normalizeInviteCode,
} from "@/lib/invite-words";

export type CreateInviteResult =
  | {
      ok: true;
      code: string;
      recipientName: string | null;
      maxUses: number;
      requiresApproval: boolean;
    }
  | {
      ok: false;
      error: string;
      /** The code was taken between the availability check and the save. */
      taken?: string;
    };

const MINT_REFUSAL: Record<MemberBlock["reason"], string> = {
  invite: "Your account isn't camp-active yet.",
  questionnaire: "Finish the questionnaire you've been asked to answer first.",
  onboarding: "Finish your burner profile first.",
  approval: "Your account is still awaiting approval.",
};

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
 *     lands in the vetting queue) and stay single-use.
 *   - A captain may pre-approve the redeemer (skip vetting) and raise the
 *     use cap to hand the code to several people.
 *
 * The only thing needed to mint a code is the code itself; an optional name
 * (who it's for) is recorded as the invite note. No email — if you had it you'd
 * just invite them by email. Validates code syntax, code uniqueness, and the
 * captain-only options server-side. The /api/tools/invite/check endpoint is a
 * UX convenience; this is the security boundary.
 */
export async function createInviteAction(
  _prev: CreateInviteResult | null,
  formData: FormData,
): Promise<CreateInviteResult> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };

  const campUser = await ensureCampUser(authUser);
  // Mirror the page's gate (the shared member ladder). The action is a
  // directly-reachable POST: without this a pending captain could mint
  // pre-approved multi-use codes, and a member could skip a blocking
  // questionnaire to hand out ways into the camp.
  const block = await memberBlock(campUser, authUser.primaryEmail);
  if (block) return { ok: false, error: MINT_REFUSAL[block.reason] };
  // Each code is a way into the camp, so minting is throttled per member like
  // the availability check beside it. Ten in ten minutes is far more than a
  // person inviting friends needs.
  const limited = await rateLimiter.limit(`invite-create:${campUser.id}`, {
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!limited.ok) {
    return {
      ok: false,
      error: `You've made a lot of invites just now. Try again in ${humanDuration(limited.retryAfterSeconds)}.`,
    };
  }
  const isCaptain = campUser.rank === "captain";

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

  // The only optional metadata is a name/label for who the code is for, stored
  // as the invite note (and surfaced to captains on the member's detail). No
  // email is collected — the code is what gets shared.
  const note = noteRaw.trim() || null;

  // Code: either user-supplied or auto-generated. Either way we re-check
  // availability before insert; the unique-PK on `code` is the final
  // backstop if two redeemers race for the same name.
  let code = normalizeInviteCode(codeRaw);
  if (code) {
    if (!isSyntacticallyValidCode(code)) {
      return {
        ok: false,
        error:
          "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.",
      };
    }
    const existing = await findInviteCodeByCode(code);
    if (existing) {
      return { ok: false, error: `'${code}' is already taken.`, taken: code };
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
      requiresApproval,
    });
  } catch {
    // Unique-PK collision (race with another redeemer) or any other DB
    // error. Don't leak details; tell the user to try again.
    return { ok: false, error: "Couldn't save invite. Try a different code." };
  }

  // The page lists the member's codes under the form; show the new one there.
  revalidatePath("/tools/invite");
  return { ok: true, code, recipientName: note, maxUses, requiresApproval };
}

export type RevokeInviteResult = { ok: true } | { ok: false; error: string };

/**
 * Revoke an invite code so nobody else can join with it. People who already
 * joined keep their place. A member may revoke the codes they made; a captain
 * may revoke any code, the root code included. The write itself is scoped the
 * same way, so a refused revoke writes nothing.
 */
export async function revokeInviteAction(
  rawCode: string,
): Promise<RevokeInviteResult> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account is still awaiting approval." };
  }
  const code = typeof rawCode === "string" ? normalizeInviteCode(rawCode) : "";
  if (!isSyntacticallyValidCode(code)) {
    return { ok: false, error: "That isn't an invite code." };
  }
  const isCaptain = campUser.rank === "captain";

  const revoked = await revokeInviteCode({
    code,
    actorUserId: campUser.id,
    createdByUserId: isCaptain ? undefined : campUser.id,
  });
  if (!revoked) {
    // Say which of the three it was: the write refuses all of them alike.
    const existing = await findInviteCodeByCode(code);
    if (!existing) return { ok: false, error: "That code doesn't exist." };
    if (existing.revokedAt) {
      return { ok: false, error: "That code is already revoked." };
    }
    return {
      ok: false,
      error: "Only the person who made this code, or a captain, can revoke it.",
    };
  }
  revalidatePath("/tools/invite");
  return { ok: true };
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
