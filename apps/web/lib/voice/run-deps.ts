import "server-only";

import { consumeRateLimit } from "@camp404/db/rate-limit";
import { getMcpScope } from "../mcp/scope";
import { rateLimit } from "../rate-limit";
import { isE2ETestMode } from "../test-mode";
import type { RunDeps } from "./run";
import { PROPOSAL_TTL_MS, sealKey } from "./seal";
import { callTool } from "./tools";

// What Do runs a sealed list with (#356), as runVoiceList passes it. A plain
// module, not the "use server" file, so the pipeline test runs these exact
// checks against Postgres (audit 2 tests-1).

/**
 * Claims a list's id once, in Postgres, so a second Do on any server instance
 * is refused (audit 2 tests-2). Fails closed: when the database cannot store
 * the claim it answers null and nothing runs. The shared limiter would fall
 * back to a count kept in this process, which another instance cannot see,
 * so the same list could run twice. E2E test mode has no database and one
 * process, so its in-memory bucket is the whole truth there.
 */
export async function spendProposal(id: string): Promise<boolean | null> {
  const key = `voice-proposal:${id}`;
  const opts = { limit: 1, windowMs: PROPOSAL_TTL_MS * 2 };
  if (isE2ETestMode()) return rateLimit(key, opts).ok;
  const verdict = await consumeRateLimit({ key, ...opts });
  return verdict === null ? null : verdict.ok;
}

/** Everything runSealedList needs for this captain and sign-in. */
export function voiceRunDeps(who: {
  userId: string;
  sessionId: string;
}): RunDeps {
  return {
    key: sealKey(),
    who,
    stillCaptain: async () =>
      (await getMcpScope(who.userId))?.isCaptain === true,
    spend: spendProposal,
    call: callTool,
  };
}
