import type { McpScope } from "./scope";

/**
 * Whether a given MCP call may return the subject's ID number (passport or SA
 * ID), or the bank details on one of their claims.
 *
 * Rule (camp-404 specific — see docs/mcp-tooling-proposal.md):
 *   1. Self always sees own data, regardless of consent.
 *   2. Otherwise the subject must have opted in (`aiDataConsent`) AND the
 *      caller must be a captain (an ID number) or a money keeper (a claim's
 *      bank details: the caller checks that rung, this checks consent).
 *
 * The consent is an extra gate on top of the website's own: the website shows
 * a captain an ID number in the member panel with no such flag. The flag has
 * no website screen (only set_my_ai_consent sets it), so it stays as the
 * safer default until the owner decides (see the MCP PR).
 */
export function canSeeIdDocuments(
  scope: Pick<McpScope, "campUserId" | "isCaptain">,
  subject: { id: string; aiDataConsent: boolean },
): boolean {
  if (scope.campUserId === subject.id) return true;
  return scope.isCaptain && subject.aiDataConsent;
}
