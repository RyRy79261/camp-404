// Whether a signed-in camp user is cleared to obtain an MCP token. Mirrors
// the app's own gate: a user must have camp access (god email or a redeemed
// invite), a completed burner profile, AND captain approval before the OAuth
// authorize endpoint issues a token. Kept as a pure function over pre-computed
// booleans so the route owns the (server-only) lookups and this stays testable.

export interface McpAccessState {
  hasCampAccess: boolean;
  profileComplete: boolean;
  isApproved: boolean;
}

export interface McpAccessDenial {
  error: string;
  description: string;
}

export function mcpAccessError(s: McpAccessState): McpAccessDenial | null {
  if (!s.hasCampAccess) {
    return {
      error: "no_camp_access",
      description:
        "Your account hasn't redeemed an invite code yet. Open the app and enter your invite code before connecting Claude.",
    };
  }
  if (!s.profileComplete) {
    return {
      error: "onboarding_incomplete",
      description:
        "Finish your burner profile in the app before connecting Claude.",
    };
  }
  if (!s.isApproved) {
    return {
      error: "pending_approval",
      description:
        "A captain still needs to approve your account before you can connect Claude.",
    };
  }
  return null;
}
