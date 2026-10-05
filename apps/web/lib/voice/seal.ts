import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// The list a captain confirms is sealed by the server (#356, "no mistakes"
// defence 7): an HMAC over exactly what was shown, bound to the captain's
// user id and their sign-in session, valid for five minutes, and spent once
// (the run claims its id through action_rate_limit with a limit of 1). Do
// runs exactly what was shown, or nothing.
//
// The key is derived from the auth server's own secret, so no new env var:
// a deployment without a real BETTER_AUTH_SECRET signs nobody in at all, and
// so has no captain to seal a list for.

export const PROPOSAL_TTL_MS = 5 * 60_000;

/** One action on a sealed list: what runs, and what the captain was shown. */
export interface SealedAction {
  /** The connector tool. */
  tool: string;
  /** Its arguments, compare-and-set values filled in from what was shown. */
  args: Record<string, unknown>;
  /** The server's sentence for the row. */
  sentence: string;
  /** The row's line of facts. */
  facts: string;
  /** The page that shows it. */
  path: string | null;
  /** Runs only if this earlier action (its index) worked. */
  dependsOn: number | null;
  /** It could not be done when the list was made, and why. */
  blocked?: string;
}

export interface ProposalBody {
  /** Spent once, through action_rate_limit. */
  id: string;
  /** The captain's camp user id. */
  userId: string;
  /** Their sign-in session. */
  sessionId: string;
  /** Expiry, epoch ms. */
  exp: number;
  actions: SealedAction[];
}

export type OpenResult =
  | { ok: true; body: ProposalBody }
  | { ok: false; reason: "tampered" | "expired" | "not_yours" };

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function mac(key: string, payload: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

/** The sealing key: HMAC of the auth secret under voice's own label. */
export function sealKey(env: NodeJS.ProcessEnv = process.env): string {
  const secret =
    env.BETTER_AUTH_SECRET?.trim() || "camp404-local-dev-only-voice-seal";
  return createHmac("sha256", secret)
    .update("camp404/voice-proposal/v1")
    .digest("hex");
}

/** Seal a list for one captain and session, valid five minutes from `now`. */
export function sealProposal(
  input: { userId: string; sessionId: string; actions: SealedAction[] },
  key: string,
  now = Date.now(),
): { token: string; body: ProposalBody } {
  const body: ProposalBody = {
    id: randomUUID(),
    userId: input.userId,
    sessionId: input.sessionId,
    exp: now + PROPOSAL_TTL_MS,
    actions: input.actions,
  };
  const payload = b64(JSON.stringify(body));
  return { token: `${payload}.${b64(mac(key, payload))}`, body };
}

/**
 * Open a sealed list for the captain asking to run it: refused when a byte
 * was changed, when it has expired, or when it was made for another person
 * or another sign-in. Spending it is the caller's (spendProposal).
 */
export function openProposal(
  token: string,
  key: string,
  who: { userId: string; sessionId: string },
  now = Date.now(),
): OpenResult {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) {
    return { ok: false, reason: "tampered" };
  }
  const expected = mac(key, payload);
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "tampered" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "tampered" };
  }
  let body: ProposalBody;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "tampered" };
  }
  if (body.userId !== who.userId || body.sessionId !== who.sessionId) {
    return { ok: false, reason: "not_yours" };
  }
  if (!(body.exp > now)) return { ok: false, reason: "expired" };
  return { ok: true, body };
}

/** The sentence for a list that cannot run, by why. */
export const OPEN_REFUSALS: Record<
  "tampered" | "expired" | "not_yours" | "spent",
  string
> = {
  tampered: "That list was changed after it was made. Nothing ran.",
  expired: "That list is more than five minutes old. Nothing ran: say it again.",
  not_yours: "That list was made for another sign-in. Nothing ran.",
  spent: "That list has already run. Nothing ran twice.",
};
