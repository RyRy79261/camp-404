// Maps a required_actions.action_key to the bespoke route that satisfies its
// gate — the code-side registry AGENTS.md describes (the DB stores the key,
// never the component). Only keys with a built page appear here; CODE
// questionnaires live here. BUILDER questionnaires have no static route — they
// dispatch to the generic runner by activationId (see nextGate). A pending
// action with neither is skipped so it can never strand a user behind a gate
// that has nowhere to send them.

const ACTION_ROUTES: Record<string, string> = {
  burner_profile: "/onboarding/questionnaire",
  // Dietary requirements and the driver profile are builder questionnaires
  // (OD3): they route through their send's activation like any other.
};

export interface PendingAction {
  actionKey: string;
  blocking: boolean;
  // required_actions.type + the activation id, present for questionnaire gates.
  type?: string;
  activationId?: string | null;
}

/**
 * The route of the first pending, BLOCKING required action that can be routed,
 * oldest first. A statically-mapped key (code questionnaire) wins; otherwise a
 * `questionnaire` action carrying an activationId (a builder questionnaire)
 * routes to the generic runner. An action with neither is skipped so it never
 * strands a user behind a gate with no page. Returns null when nothing blocks.
 */
export function nextGate(actions: PendingAction[]): string | null {
  for (const action of actions) {
    if (!action.blocking) continue;
    const staticRoute = ACTION_ROUTES[action.actionKey];
    if (staticRoute) return staticRoute;
    if (action.type === "questionnaire" && action.activationId) {
      return `/questionnaires/${action.activationId}`;
    }
  }
  return null;
}

// What a captain calls each CODE questionnaire's action. Its stored title is
// written to the member ("Complete your burner profile"); a captain reading a
// list of what someone still owes wants the thing's name. Only keys the code
// writes are here (grep `actionKey:`): dietary requirements and the driver
// profile are builder questionnaires now, and their titles are already names.
// A Map, not an object: a builder key is captain-typed, and "constructor" must
// fall through to its title rather than hit Object.prototype.
const ACTION_NAMES = new Map<string, string>([
  ["burner_profile", "Burner profile"],
]);

/**
 * A captain-facing name for one outstanding required action: the short name
 * of a code questionnaire, otherwise the title stored on the row (a builder
 * questionnaire's title, as the captain who wrote it named it).
 */
export function requiredActionName(actionKey: string, title: string): string {
  return ACTION_NAMES.get(actionKey) ?? title;
}
