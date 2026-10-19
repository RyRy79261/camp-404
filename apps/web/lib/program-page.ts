import "server-only";

import { captainPageGate, type CaptainPageAccess } from "./captain-gate";
import type { ProgramId } from "./program-routes";
import { PROGRAM_REGISTRY, type RegistryEntry } from "./programs";

// A console page's gate, read from its program's registry entry
// (lib/programs.ts) instead of written again in the page: the entry's `rank`
// through `captainPageGate`, then its `rule` (if any) on the same actor. So
// the bar that decides the icon is the bar that guards the page.
//
// The page keeps its own order: it calls this first, then its notFound() and
// redirect(), and draws a CaptainLock when it may not open. Every action keeps
// its own gate, and every write reads and locks its own actor.
//
// lib/__tests__/program-registry-drift.test.ts fails when a page calls this
// with another program's id.

export interface ProgramPageAccess extends CaptainPageAccess {
  /**
   * Cleared for the rank AND the entry's rule passed (always `cleared` when
   * the entry has no rule). False: lock the page, and fetch no data.
   */
  allowed: boolean;
}

const ENTRIES = new Map<ProgramId, RegistryEntry>(
  PROGRAM_REGISTRY.map((entry) => [entry.id, entry]),
);

export async function programPage(
  id: RegistryEntry["id"],
): Promise<ProgramPageAccess> {
  const entry = ENTRIES.get(id);
  if (!entry) throw new Error(`No registry entry for program "${id}"`);
  const gate = await captainPageGate(entry.rank);
  const allowed =
    gate.cleared && (entry.rule ? entry.rule.allows(gate.actor) : true);
  return { ...gate, allowed };
}
