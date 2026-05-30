// Pure decision logic for the push-drain worker (no DB, no Firebase) so it is
// fully unit-testable. `push.ts` does the DB orchestration and `apps/web`
// provides the actual firebase-admin send fn matching the PushSend shape.

// FCM error codes that mean a registration token is dead and must be removed.
const PRUNE_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Whether an FCM send error means the token should be deleted (vs. retried). */
export function shouldPruneToken(errorCode: string | null | undefined): boolean {
  return !!errorCode && PRUNE_CODES.has(errorCode);
}

export interface TokenSendResult {
  token: string;
  success: boolean;
  errorCode?: string | null;
}

/** The injected send fn — `apps/web/lib/firebase-admin.ts` provides the impl. */
export type PushSend = (
  tokens: string[],
  notification: { title: string; body: string },
  data: Record<string, string>,
) => Promise<TokenSendResult[]>;

/**
 * Terminal `pushStatus` for a delivery from its per-token send results:
 * `skipped` if the recipient has no tokens, `sent` if at least one token
 * succeeded, otherwise `failed`.
 */
export function deliveryPushStatus(
  results: TokenSendResult[],
): "sent" | "failed" | "skipped" {
  if (results.length === 0) return "skipped";
  if (results.some((r) => r.success)) return "sent";
  return "failed";
}

/** Split into chunks of at most `size` (FCM caps a multicast at 500 tokens). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Map firebase-admin's positional `BatchResponse.responses` back to per-token
 * results. The send API does NOT throw on per-token failures — it returns a
 * response array aligned by index with the tokens — so this index alignment is
 * how a failure maps to the exact token to prune.
 */
export function mapSendResponses(
  tokens: string[],
  responses: Array<{ success: boolean; error?: { code?: string } | null }>,
): TokenSendResult[] {
  return responses.map((r, i) => ({
    token: tokens[i]!,
    success: r.success,
    errorCode: r.error?.code ?? null,
  }));
}
