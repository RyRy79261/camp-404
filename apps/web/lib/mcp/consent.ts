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
  scope: Pick<McpScope, "campUserId" | "isCaptain">,
  subject: { id: string; aiDataConsent: boolean },
): boolean {
  if (scope.campUserId === subject.id) return true;
  return scope.isCaptain && subject.aiDataConsent;
}
