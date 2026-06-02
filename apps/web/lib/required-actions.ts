import { nextGate as coreNextGate } from "@camp404/core";

// Maps a required_actions.action_key to the bespoke route that satisfies its
// gate — the code-side registry AGENTS.md describes (the DB stores the key,
// never the component). Only keys with a built page appear here; a pending
// action with no mapped route is skipped by nextGate so it can never strand a
// user behind a gate that has nowhere to send them.

const ACTION_ROUTES: Record<string, string> = {
  burner_profile: "/onboarding/questionnaire",
  // dietary_requirements / driver_profile slot in here once their bespoke
  // pages exist; until then their activations stay pending but don't gate.
};

export interface PendingAction {
  actionKey: string;
  blocking: boolean;
}

/**
 * The route of the first pending, blocking required action that maps to a
 * built gate component, in the order given (oldest first). Returns null when
 * nothing blocks the user — or when no pending action maps to a route yet.
 */
export function nextGate(actions: PendingAction[]): string | null {
  return coreNextGate(actions, ACTION_ROUTES);
}
