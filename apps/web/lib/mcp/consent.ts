import type { McpScope } from "./scope";

/**
 * Whether a given MCP call is allowed to surface the subject's
 * identification documents (passport, SA ID, EFT details, others'
 * reimbursement bank details).
 *
 * Rule (camp-404 specific — see docs/mcp-tooling-proposal.md):
 *   1. Self always sees own data, regardless of consent.
 *   2. Otherwise the subject must have opted in AND the caller must
 *      be a captain. Both gates are required.
 *
 * Everything else (phone, email, emergency contacts, dietary, vehicle
 * details, …) is freely visible at the appropriate tier and bypasses
 * this gate entirely.
 */
export function canSeeIdDocuments(
  scope: McpScope,
  subject: { id: string; aiDataConsent: boolean },
): boolean {
  if (scope.campUserId === subject.id) return true;
  return scope.isCaptain && subject.aiDataConsent;
}

/**
 * Removes the ID-document fields from a user row when the caller is
 * not allowed to see them. Returns a new object — callers can pass the
 * raw row through this and the encrypted columns disappear.
 *
 * The caller's responsibility is to never decrypt these fields before
 * the consent gate; this redaction is the second line of defence.
 */
export function redactIdDocuments<
  R extends {
    id: string;
    aiDataConsent: boolean;
    passportEncrypted?: string | null;
    saIdEncrypted?: string | null;
    eftDetailsEncrypted?: string | null;
  },
>(scope: McpScope, row: R): R {
  if (canSeeIdDocuments(scope, row)) return row;
  const { passportEncrypted: _p, saIdEncrypted: _s, eftDetailsEncrypted: _e, ...rest } = row;
  return { ...(rest as R) };
}
