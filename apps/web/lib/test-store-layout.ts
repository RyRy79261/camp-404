import "server-only";

import { randomBytes } from "node:crypto";
import {
  arrivalDayCounts,
  canEditLayout,
  canShareLayout,
  neighbourView,
  type ArrivalDayCount,
} from "@camp404/core";
import {
  ALREADY_HAS_LAYOUT,
  CHECK_LAYOUT,
  LAYOUT_CHANGED,
  LAYOUT_VERSION_GONE,
  NOT_A_LAYOUT_EDITOR,
  NOT_A_LAYOUT_SHARER,
  NOTHING_TO_SHARE,
  NO_EARLIER_LAYOUT,
  type CampLayoutState,
  type LayoutShare,
  type LayoutVersionRow,
  type LayoutWriteResult,
  type SharedLayout,
} from "@camp404/db/camp-layout";
import { reachRank } from "@camp404/db/power";
import { CampLayout, LAYOUT_NOTE_MAX } from "@camp404/types";
import { testStore } from "./test-store";

// The camp layout's twin for E2E (#271): the same rules as
// @camp404/db/camp-layout, on the in-memory store. Kept in its own module so
// the big store stays as it is; its state lives on globalThis like the
// store's, and /api/test/reset clears it with the store.

interface TestLayoutVersion {
  number: number;
  body: CampLayout;
  note: string | null;
  savedByUserId: string | null;
  savedAt: Date;
}

interface TestLayoutYear {
  latestVersion: number;
  shareToken: string | null;
  sharedAt: Date | null;
  versions: TestLayoutVersion[];
}

const GLOBAL_KEY = "__camp404TestLayoutStore__";

function years(): Map<number, TestLayoutYear> {
  const g = globalThis as Record<string, unknown>;
  g[GLOBAL_KEY] ??= new Map<number, TestLayoutYear>();
  return g[GLOBAL_KEY] as Map<number, TestLayoutYear>;
}

function yearOf(cycle: number): TestLayoutYear {
  let row = years().get(cycle);
  if (!row) {
    row = { latestVersion: 0, shareToken: null, sharedAt: null, versions: [] };
    years().set(cycle, row);
  }
  return row;
}

function isEditor(actorId: string): boolean {
  const reach = testStore.senderReach(actorId);
  return canEditLayout(reachRank(reach), reach ?? []);
}

function isSharer(actorId: string): boolean {
  return canShareLayout(reachRank(testStore.senderReach(actorId)));
}

function nameOf(userId: string | null): string | null {
  return userId ? (testStore.findUserById(userId)?.displayName ?? null) : null;
}

function cleanNote(note: string | null | undefined): string | null {
  const text = note?.trim() ?? "";
  return text === "" ? null : text.slice(0, LAYOUT_NOTE_MAX);
}

function addVersion(
  cycle: number,
  layout: CampLayout,
  expectedVersion: number,
  note: string | null,
  actorId: string,
): number | string {
  const year = yearOf(cycle);
  if (year.latestVersion !== expectedVersion) return LAYOUT_CHANGED;
  const next = expectedVersion + 1;
  year.latestVersion = next;
  year.versions.push({
    number: next,
    body: structuredClone(layout),
    note,
    savedByUserId: actorId,
    savedAt: new Date(),
  });
  return next;
}

function previousCycle(cycle: number): number | null {
  const earlier = [...years().entries()]
    .filter(([c, y]) => c < cycle && y.latestVersion >= 1)
    .map(([c]) => c);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}

export const testLayoutStore = {
  reset(): void {
    years().clear();
  },

  getCampLayout(cycle?: number, versionNumber?: number): CampLayoutState {
    const year = cycle ?? testStore.currentCycleNumber();
    const head = years().get(year);
    const latest = head?.latestVersion ?? 0;
    const wanted =
      versionNumber !== undefined &&
      Number.isInteger(versionNumber) &&
      versionNumber >= 1 &&
      versionNumber <= latest
        ? versionNumber
        : latest;
    const row = head?.versions.find((v) => v.number === wanted);
    if (!row) {
      return {
        cycle: year,
        version: 0,
        layout: null,
        note: null,
        savedAt: null,
        savedByName: null,
        shared: head?.shareToken != null,
      };
    }
    return {
      cycle: year,
      version: row.number,
      layout: structuredClone(row.body),
      note: row.note,
      savedAt: row.savedAt,
      savedByName: nameOf(row.savedByUserId),
      shared: head?.shareToken != null,
    };
  },

  listLayoutVersions(cycle?: number, limit = 20): LayoutVersionRow[] {
    const year = cycle ?? testStore.currentCycleNumber();
    return [...(years().get(year)?.versions ?? [])]
      .sort((a, b) => b.number - a.number)
      .slice(0, limit)
      .map((v) => ({
        number: v.number,
        note: v.note,
        savedAt: v.savedAt,
        savedByName: nameOf(v.savedByUserId),
        pieces: v.body.pieces.length,
      }));
  },

  previousLayoutCycle(): number | null {
    return previousCycle(testStore.currentCycleNumber());
  },

  layoutArrivalCounts(cycle?: number): ArrivalDayCount[] {
    const year = cycle ?? testStore.currentCycleNumber();
    return arrivalDayCounts(testStore.arrivalDaysIn(year));
  },

  getLayoutShare(cycle?: number): LayoutShare {
    const year = cycle ?? testStore.currentCycleNumber();
    const head = years().get(year);
    return {
      token: head?.shareToken ?? null,
      sharedAt: head?.sharedAt ?? null,
    };
  },

  getSharedLayout(token: string): SharedLayout | null {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
    const found = [...years().entries()].find(
      ([, y]) => y.shareToken === token,
    );
    if (!found) return null;
    const [cycle, head] = found;
    const latest = head.versions.find((v) => v.number === head.latestVersion);
    return {
      cycle,
      layout: latest ? neighbourView(latest.body) : null,
      arrivals: arrivalDayCounts(testStore.arrivalDaysIn(cycle)),
    };
  },

  saveCampLayout(input: {
    actorId: string;
    layout: CampLayout;
    expectedVersion: number;
    note?: string | null;
  }): LayoutWriteResult<{ version: number }> {
    const parsed = CampLayout.safeParse(input.layout);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_LAYOUT,
      };
    }
    if (!isEditor(input.actorId)) {
      return { ok: false, error: NOT_A_LAYOUT_EDITOR };
    }
    const out = addVersion(
      testStore.currentCycleNumber(),
      parsed.data,
      input.expectedVersion,
      cleanNote(input.note),
      input.actorId,
    );
    return typeof out === "string"
      ? { ok: false, error: out }
      : { ok: true, version: out };
  },

  restoreLayoutVersion(input: {
    actorId: string;
    number: number;
    expectedVersion: number;
  }): LayoutWriteResult<{ version: number }> {
    if (!isEditor(input.actorId)) {
      return { ok: false, error: NOT_A_LAYOUT_EDITOR };
    }
    const cycle = testStore.currentCycleNumber();
    const old = years()
      .get(cycle)
      ?.versions.find((v) => v.number === input.number);
    if (!old) return { ok: false, error: LAYOUT_VERSION_GONE };
    const out = addVersion(
      cycle,
      old.body,
      input.expectedVersion,
      `Brought back version ${input.number}`,
      input.actorId,
    );
    return typeof out === "string"
      ? { ok: false, error: out }
      : { ok: true, version: out };
  },

  copyLastYearLayout(input: {
    actorId: string;
  }): LayoutWriteResult<{ version: number; fromCycle: number }> {
    if (!isEditor(input.actorId)) {
      return { ok: false, error: NOT_A_LAYOUT_EDITOR };
    }
    const cycle = testStore.currentCycleNumber();
    if ((years().get(cycle)?.latestVersion ?? 0) > 0) {
      return { ok: false, error: ALREADY_HAS_LAYOUT };
    }
    const fromCycle = previousCycle(cycle);
    const from =
      fromCycle === null
        ? undefined
        : years()
            .get(fromCycle)
            ?.versions.find(
              (v) => v.number === years().get(fromCycle)?.latestVersion,
            );
    if (fromCycle === null || !from) {
      return { ok: false, error: NO_EARLIER_LAYOUT };
    }
    const out = addVersion(
      cycle,
      from.body,
      0,
      `Copied from ${fromCycle}`,
      input.actorId,
    );
    return typeof out === "string"
      ? { ok: false, error: out }
      : { ok: true, version: out, fromCycle };
  },

  shareCampLayout(input: {
    actorId: string;
  }): LayoutWriteResult<{ token: string }> {
    if (!isSharer(input.actorId)) {
      return { ok: false, error: NOT_A_LAYOUT_SHARER };
    }
    const head = years().get(testStore.currentCycleNumber());
    if (!head || head.latestVersion < 1) {
      return { ok: false, error: NOTHING_TO_SHARE };
    }
    head.shareToken = randomBytes(24).toString("base64url");
    head.sharedAt = new Date();
    return { ok: true, token: head.shareToken };
  },

  unshareCampLayout(input: {
    actorId: string;
  }): LayoutWriteResult<{ changed: boolean }> {
    if (!isSharer(input.actorId)) {
      return { ok: false, error: NOT_A_LAYOUT_SHARER };
    }
    const head = years().get(testStore.currentCycleNumber());
    if (!head?.shareToken) return { ok: true, changed: false };
    head.shareToken = null;
    head.sharedAt = null;
    return { ok: true, changed: true };
  },

  /** Seed a year's saved plan directly (a spec's "last year"). */
  seedLayout(cycle: number, layout: CampLayout): void {
    const year = yearOf(cycle);
    const next = year.latestVersion + 1;
    year.latestVersion = next;
    year.versions.push({
      number: next,
      body: structuredClone(layout),
      note: null,
      savedByUserId: null,
      savedAt: new Date(),
    });
  },
};
