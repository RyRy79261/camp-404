"use server";

import { getAuthenticatedUser, getSessionId } from "@/lib/auth";
import { revalidateManifest } from "@/lib/manifest-revalidate";
import { getMcpScope } from "@/lib/mcp/scope";
import { resolveMemberState } from "@/lib/member-gate";
import { rateLimiter } from "@/lib/rate-limit";
import { setVoiceConsent } from "@/lib/voice/consent";
import { runSealedList, type RunResult } from "@/lib/voice/run";
import { PROPOSAL_TTL_MS, sealKey } from "@/lib/voice/seal";
import { callTool } from "@/lib/voice/tools";

// Voice's two server actions (#356). Async exports only: this is a
// "use server" file.

/** The signed-in captain, or null for anyone else (held, signed out, a member). */
async function captainNow(): Promise<{
  userId: string;
  sessionId: string;
} | null> {
  const user = await getAuthenticatedUser();
  const sessionId = await getSessionId();
  if (!user || !sessionId) return null;
  const state = await resolveMemberState();
  if (state.kind !== "member" || state.block) return null;
  if (state.campUser.rank !== "captain") return null;
  return { userId: state.campUser.id, sessionId };
}

/**
 * Do: run the ticked actions of a sealed list, in order, one by one, as the
 * captain who is signed in now. The list must be theirs, from this sign-in,
 * under five minutes old and never run before; they must still be a captain;
 * and each action's own tool checks their access again.
 */
export async function runVoiceList(
  token: string,
  ticked: number[],
): Promise<RunResult> {
  const who = await captainNow();
  if (!who)
    return { ok: false, message: "Voice is for captains. Nothing ran." };
  if (!Array.isArray(ticked) || !ticked.every((n) => Number.isInteger(n))) {
    return { ok: false, message: "Nothing ran." };
  }
  return runSealedList(String(token), ticked, {
    key: sealKey(),
    who,
    stillCaptain: async () =>
      (await getMcpScope(who.userId))?.isCaptain === true,
    spend: async (id) => {
      const verdict = await rateLimiter.limit(`voice-proposal:${id}`, {
        limit: 1,
        windowMs: PROPOSAL_TTL_MS * 2,
      });
      return verdict.ok;
    },
    call: callTool,
  });
}

/**
 * The one-time notice: turn voice on, or off again (Settings). Turning it on
 * is a captain's; turning it off is anyone's who has it on, so a captain who
 * was demoted or is held can still withdraw their consent (POPIA: a consent
 * that cannot be withdrawn is not one).
 */
export async function setVoiceOn(on: boolean): Promise<{ ok: boolean }> {
  if (on === true) {
    const who = await captainNow();
    if (!who) return { ok: false };
    await setVoiceConsent(who.userId, true);
  } else {
    const state = await resolveMemberState();
    if (state.kind !== "member") return { ok: false };
    await setVoiceConsent(state.campUser.id, false);
  }
  revalidateManifest();
  return { ok: true };
}
