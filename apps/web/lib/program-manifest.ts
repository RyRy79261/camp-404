import "server-only";

import { cache } from "react";
import { deriveViewerRank } from "@camp404/core";
import { readBootstrapState } from "./bootstrap";
import { getCampSettings } from "./camp-config";
import { getInboxBadge } from "./inbox-badge";
import { getMyLift } from "./lifts";
import {
  isAwaitingApproval,
  resolveMemberState,
  type MemberState,
} from "./member-gate";
import {
  buildProgramManifest,
  type ManifestMode,
  type ProgramManifest,
} from "./programs";
import { deriveSystemStatus, type DatabaseProbe } from "./system-status";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import { getMyMemberships, isApproved } from "./users";

// The server half of lib/programs.ts: gather one member's facts for this
// request and build their manifest. Built on `resolveMemberState()`, which
// stays the one caller of `runDueWorkAfterResponse`.
//
// Every input is a request-cached read the page shares: the camp settings
// (one `camp_settings` read), the member's memberships this year (one read),
// the inbox badge, the lift, the setup state. So drawing the header from the
// manifest costs fewer reads than the header made on its own before.

/**
 * Which desktop the member gets, or null for none (signed out, the invite and
 * onboarding gates, and a rejected applicant, who all get the page bare).
 */
export function manifestModeFor(state: MemberState): ManifestMode | null {
  if (state.kind !== "member") return null;
  const { block, campUser } = state;
  if (!block) return "full";
  if (block.reason === "questionnaire") return "held";
  if (isAwaitingApproval(campUser, block)) return "restricted";
  return null;
}

/**
 * How many system checks need attention, from the environment checks and the
 * fact that this request already reached the database (it read the member).
 * Never the timed probe `getSystemStatus` runs for /captains/system: that
 * waits up to 5 s, and every member's page now asks.
 */
async function healthWarnings(): Promise<number> {
  let probe: DatabaseProbe;
  if (usesTestStore()) {
    probe = {
      kind: "ok",
      latencyMs: 0,
      captainCount: testStore.countCaptains(),
      bootstrapped: true,
    };
  } else {
    const setup = await readBootstrapState();
    probe = {
      kind: "ok",
      latencyMs: 0,
      captainCount: setup.captainCount,
      bootstrapped: setup.bootstrappedAt !== null,
    };
  }
  const status = deriveSystemStatus(process.env, probe);
  return [...status.core, ...status.optional].filter(
    (check) => check.tone === "attention",
  ).length;
}

/**
 * The signed-in member's manifest for this request, or null when they get no
 * desktop. React `cache()` only, never `unstable_cache` or `"use cache"`: it
 * is keyed by viewer, and must never outlive the render.
 */
export const getProgramManifest = cache(
  async (): Promise<ProgramManifest | null> => {
    const state = await resolveMemberState();
    const mode = manifestModeFor(state);
    if (!mode || state.kind !== "member") return null;
    const { campUser, authUser } = state;
    const approved = isApproved(campUser, authUser.primaryEmail);
    // An applicant has no teams, lift or health flag to show, and a member
    // held before approval gets only the wallpaper: skip those reads.
    const desk = mode === "full" || (mode === "held" && approved);

    const [settings, memberships, inbox, lift, warnings] = await Promise.all([
      getCampSettings(),
      desk ? getMyMemberships(campUser.id) : Promise.resolve([]),
      mode === "held" ? Promise.resolve(null) : getInboxBadge(campUser.id),
      desk ? getMyLift(campUser.id) : Promise.resolve(null),
      mode === "full" ? healthWarnings() : Promise.resolve(null),
    ]);

    return buildProgramManifest({
      mode,
      approved,
      rank: deriveViewerRank(
        campUser.rank,
        memberships.some((m) => m.isLead),
      ),
      memberships,
      teams: settings.teams.teams,
      hasLift: lift !== null,
      inbox: inbox?.total ?? 0,
      healthWarnings: warnings,
    });
  },
);
