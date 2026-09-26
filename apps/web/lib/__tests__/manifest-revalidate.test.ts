import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Next keeps the console layout mounted across navigation, so an action that
// changes one of the acting member's manifest inputs must call
// `revalidateManifest()`, or their header and Home stay stale until a hard
// load (the bug commit 12eb18e fixed once, by hand). The test reads each
// action's body, comments stripped, and fails when the call is gone.
//
// What it cannot do: the list below is kept BY HAND (design doc, section 4,
// "Staleness"), so a new action that changes a manifest input is not found
// until someone adds it here. And it checks the call is in the body, not that
// every branch reaches it. Inputs that change for a member who did not act
// (a lift a driver or an MCP tool filled, a rank another captain changed) are
// not revalidated for that member at all; the design doc's Staleness section
// lists them.

const APP = path.resolve(__dirname, "../../app");

const MUST_REVALIDATE: Record<string, readonly string[]> = {
  // Approvals, and a captain's own team, lead and approval changes.
  "(console)/captains/camp-management/actions.ts": [
    "decideApprovalAction",
    "decideApprovalsAction",
    "assignTeamAction",
    "removeTeamAction",
    "setTeamLeadAction",
  ],
  // A member accepting the captaincy gains the captain programs.
  "(console)/notifications/actions.ts": [
    "acceptCaptainPromotionAction",
    // The bell's count is a tray field.
    "markAllNotificationsReadAction",
  ],
  // Team labels, order and archiving; the founding year and the rollover.
  "(console)/captains/camp-settings/actions.ts": [
    "renameTeamAction",
    "moveTeamAction",
    "setTeamArchivedAction",
    "setFoundingYearAction",
    "advanceCycleAction",
  ],
  // Gate completions: the member's desktop changes mode.
  "(console)/questionnaires/[activationId]/actions.ts": [
    "saveBuilderResponses",
  ],
  "onboarding/questionnaire/actions.ts": ["saveBurnerProfile"],
  "signup/required/actions.ts": ["submitInviteCode"],
  "setup/actions.ts": ["completeSetupAction"],
  // Pins ride in the layout.
  "(console)/captains/announcements/actions.ts": ["setPinnedAction"],
};

/**
 * The source of one exported function, up to the next top-level export, with
 * its comments removed, so a call that was only commented out does not count.
 */
function bodyOf(source: string, name: string): string | null {
  const start = source.indexOf(`export async function ${name}(`);
  if (start === -1) return null;
  const next = source.indexOf("\nexport ", start + 1);
  return withoutComments(source.slice(start, next === -1 ? undefined : next));
}

/** Block and line comments out (a `://` in a URL string is kept). */
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("actions that change a manifest input refresh the manifest", () => {
  for (const [file, actions] of Object.entries(MUST_REVALIDATE)) {
    const source = readFileSync(path.join(APP, file), "utf8");
    for (const action of actions) {
      it(`${file} ${action}`, () => {
        const body = bodyOf(source, action);
        expect(body, `${action} not found in app/${file}`).not.toBeNull();
        expect(body).toMatch(/\brevalidateManifest\(\)/);
      });
    }
  }

  it("does not count a call that is only in a comment", () => {
    const source = [
      "export async function a() {",
      "  // revalidateManifest();",
      "  /* revalidateManifest(); */",
      '  return "https://camp404.test/";',
      "}",
    ].join("\n");
    expect(bodyOf(source, "a")).not.toMatch(/\brevalidateManifest\(\);/);
  });

  it('keeps revalidateManifest out of every "use server" file\'s exports', () => {
    // Exported from a "use server" file, a sync function breaks the page under
    // next dev, and an async one is an endpoint any client may call.
    const helper = readFileSync(
      path.resolve(__dirname, "../manifest-revalidate.ts"),
      "utf8",
    );
    expect(helper).not.toMatch(/^\s*["']use server["']/m);
    expect(helper).toMatch(/^import "server-only";/m);
    for (const file of Object.keys(MUST_REVALIDATE)) {
      const source = readFileSync(path.join(APP, file), "utf8");
      expect(source, file).not.toMatch(/export\s+\{[^}]*revalidateManifest/);
    }
  });
});
