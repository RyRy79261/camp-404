import "server-only";

import { POWER_TEAM, campLocalInstant, wouldLoop } from "@camp404/core";
import {
  LOAD_GONE,
  NOTHING_TO_COPY,
  NOT_A_POWER_EDITOR,
} from "@camp404/db/power";
import type {
  GeneratorRow,
  PowerLoadRow,
  PowerWriteResult,
} from "@camp404/db/power";
import {
  ALREADY_HAS_GRID,
  GRID_FEEDS_OTHERS,
  GRID_KIND_FIXED,
  GRID_LOOP,
  GRID_NODE_CHANGED,
  GRID_NODE_GONE,
  GRID_PARENT_END_POINT,
  GRID_PARENT_GONE,
  type GridNodeRow,
} from "@camp404/db/power-grid";
import {
  READINESS_ALREADY_STARTED,
  READINESS_ITEM_CHANGED,
  READINESS_ITEM_GONE,
  READINESS_OWNER_NOT_MEMBER,
  READINESS_TICKED_FIRST,
  SHARING_CHANGED,
  SHARING_GONE,
  WORK_PLAN_ALREADY_ON_BOARD,
  type ReadinessItemRow,
  type SharingAgreement,
  type WorkPlanTaskRow,
} from "@camp404/db/power-readiness";
import {
  CAN_CHANGED,
  CAN_GONE,
  ENTRY_ALREADY_CORRECTED,
  ENTRY_GONE,
  ENTRY_STRUCK_OUT,
  NOT_A_CAMP_MEMBER,
  REFUEL_GENERATOR_GONE,
  REFUEL_IN_FUTURE,
  canHoldsOnly,
  type FuelCanRow,
  type RefuelEntryRow,
} from "@camp404/db/power-site";
import { GENERATOR_GONE } from "@camp404/db/power";
import {
  CUSTOM_READINESS_KEY,
  POWER_WORK_PLAN_TEMPLATE,
  READINESS_TEMPLATE,
  type AddFuelCansInput,
  type AddReadinessItemInput,
  type CorrectRefuelInput,
  type EditFuelCanInput,
  type EditGridNodeInput,
  type EditReadinessItemInput,
  type GridNodeInput,
  type RefuelInput,
  type SharingAgreementInput,
  type StrikeRefuelInput,
  type Team,
} from "@camp404/types";

// The test store's twins of @camp404/db/power-site, power-grid and
// power-readiness (#255–#257): the same rules and the same sentences, on
// in-memory rows, so the E2E suite drives the power pages without a database.
// test-store.ts owns the state (on `S.powerSite`) and hands in what the twins
// need from it; nothing here keeps state of its own.

interface StoredEntry {
  id: string;
  cycle: number;
  generatorId: string;
  refuelledAt: Date;
  litres: number;
  fromCanId: string | null;
  doneByUserId: string | null;
  hourMeter: number | null;
  note: string | null;
  fromPaper: boolean;
  correctsEntryId: string | null;
  voided: boolean;
  createdAt: Date;
}

interface StoredItem {
  id: string;
  cycle: number;
  generatorId: string;
  itemKey: string;
  label: string;
  ownerUserId: string | null;
  dueOn: string | null;
  doneAt: Date | null;
  doneByUserId: string | null;
  sort: number;
  version: number;
}

/** The store's rows for power on site. */
export interface TestPowerSite {
  cans: (FuelCanRow & { createdAt: Date })[];
  entries: StoredEntry[];
  nodes: (GridNodeRow & { createdAt: Date })[];
  /** Load id to the point it plugs in at. */
  loadPoints: Map<string, string>;
  items: StoredItem[];
  workPlan: { cycle: number; taskId: string; sort: number }[];
  agreements: Map<number, SharingAgreement>;
}

export function emptyPowerSite(): TestPowerSite {
  return {
    cans: [],
    entries: [],
    nodes: [],
    loadPoints: new Map(),
    items: [],
    workPlan: [],
    agreements: new Map(),
  };
}

/** What the twins read from the rest of the store. */
export interface PowerSiteDeps {
  state: () => TestPowerSite;
  cycle: () => number;
  isPowerEditor: (userId: string) => boolean;
  /** A member's display name and whether they are an approved member. */
  member: (
    userId: string,
  ) => { displayName: string | null; approved: boolean } | null;
  generators: () => GeneratorRow[];
  loads: () => PowerLoadRow[];
  task: (id: string) => {
    title: string;
    description: string | null;
    status: string;
    assigneeId: string | null;
    dueAt: Date | null;
  } | null;
  addTask: (input: {
    creatorId: string;
    title: string;
    description: string | null;
    team: Team | null;
    assigneeId: string | null;
    dueAt: Date | null;
  }) => { ok: true; id: string } | { ok: false; error: string };
}

const FUTURE_SLACK_MS = 10 * 60_000;

export function powerSiteTwins(d: PowerSiteDeps) {
  const S = () => d.state();

  /** The db module's write(): the editor check, then the body or its refusal. */
  function write<T extends object>(
    actorId: string,
    fn: (cycle: number) => T | string,
  ): PowerWriteResult<T> {
    if (!d.isPowerEditor(actorId))
      return { ok: false, error: NOT_A_POWER_EDITOR };
    const out = fn(d.cycle());
    return typeof out === "string"
      ? { ok: false, error: out }
      : { ok: true, ...out };
  }

  const name = (id: string | null) =>
    id ? (d.member(id)?.displayName ?? null) : null;
  const approved = (id: string) => d.member(id)?.approved === true;

  // --- Fuel -----------------------------------------------------------------

  function canOf(cycle: number, id: string | null) {
    return id
      ? S().cans.find((c) => c.id === id && c.cycle === cycle)
      : undefined;
  }

  /** prepareEntry's twin: every check before any change, then the can. */
  function prepare(cycle: number, input: RefuelInput, now: Date) {
    const at = campLocalInstant(input.refuelledAt);
    if (at.getTime() > now.getTime() + FUTURE_SLACK_MS) return REFUEL_IN_FUTURE;
    if (!d.generators().some((g) => g.id === input.generatorId)) {
      return REFUEL_GENERATOR_GONE;
    }
    if (!approved(input.doneByUserId)) return NOT_A_CAMP_MEMBER;
    if (input.fromCanId) {
      const can = canOf(cycle, input.fromCanId);
      if (!can) return CAN_GONE;
      if (can.litres < input.litres - 1e-9) return canHoldsOnly(can.litres);
    }
    return {
      at,
      take: () => {
        const can = canOf(cycle, input.fromCanId);
        if (!can) return;
        can.litres = Math.max(0, can.litres - input.litres);
        can.version += 1;
      },
    };
  }

  function entryValues(cycle: number, input: RefuelInput, at: Date) {
    return {
      cycle,
      generatorId: input.generatorId,
      refuelledAt: at,
      litres: input.litres,
      fromCanId: input.fromCanId,
      doneByUserId: input.doneByUserId,
      hourMeter: input.hourMeter,
      note: input.note,
      fromPaper: input.fromPaper,
    };
  }

  /** claimForReplacement's twin, without the change: the refusal or the entry. */
  function claim(cycle: number, entryId: string): StoredEntry | string {
    const old = S().entries.find((e) => e.id === entryId && e.cycle === cycle);
    if (!old) return ENTRY_GONE;
    if (old.voided) return ENTRY_STRUCK_OUT;
    if (S().entries.some((e) => e.correctsEntryId === entryId)) {
      return ENTRY_ALREADY_CORRECTED;
    }
    return old;
  }

  function giveBack(old: StoredEntry) {
    const can = S().cans.find((c) => c.id === old.fromCanId);
    if (!can) return;
    can.litres = Math.min(can.capacityLitres, can.litres + old.litres);
    can.version += 1;
  }

  // --- Grid -----------------------------------------------------------------

  const nodesOf = (cycle: number) => S().nodes.filter((n) => n.cycle === cycle);

  function parentRefusal(
    cycle: number,
    parentId: string | null,
  ): string | null {
    if (parentId === null) return null;
    const parent = nodesOf(cycle).find((n) => n.id === parentId);
    if (!parent) return GRID_PARENT_GONE;
    if (parent.kind === "end_point") return GRID_PARENT_END_POINT;
    return null;
  }

  function nodeFields(input: GridNodeInput) {
    return {
      name: input.name,
      kind: input.kind,
      parentId: input.parentId,
      cable: input.cable,
      cableLengthM: input.cableLengthM,
      cableGaugeMm2: input.cableGaugeMm2,
      cableRatedAmps: input.cableRatedAmps,
      adapter: input.adapter,
      haveCable: input.haveCable,
      haveAdapter: input.haveAdapter,
    };
  }

  // --- Readiness ------------------------------------------------------------

  const liveGenerator = (id: string) =>
    d.generators().some((g) => g.id === id && g.archivedAt === null);

  function itemsOf(cycle: number, generatorId: string) {
    return S().items.filter(
      (i) => i.cycle === cycle && i.generatorId === generatorId,
    );
  }

  function itemLoss(cycle: number, itemId: string) {
    return S().items.some((i) => i.id === itemId && i.cycle === cycle)
      ? READINESS_ITEM_CHANGED
      : READINESS_ITEM_GONE;
  }

  return {
    // --- Fuel stock and the refuelling log (#255) -------------------------

    listFuelCans(cycle?: number): FuelCanRow[] {
      const year = cycle ?? d.cycle();
      return S()
        .cans.filter((c) => c.cycle === year)
        .sort((a, b) => a.sort - b.sort)
        .map(({ createdAt: _c, ...c }) => ({ ...c }));
    },

    listRefuelEntries(cycle?: number): RefuelEntryRow[] {
      const year = cycle ?? d.cycle();
      return S()
        .entries.filter((e) => e.cycle === year)
        .sort(
          (a, b) =>
            b.refuelledAt.getTime() - a.refuelledAt.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map((e) => ({
          ...e,
          generatorModel:
            d.generators().find((g) => g.id === e.generatorId)?.model ?? null,
          fromCanLabel:
            S().cans.find((c) => c.id === e.fromCanId)?.label ?? null,
          doneByName: name(e.doneByUserId),
        }));
    },

    previousRefuelCycle(): number | null {
      const now = d.cycle();
      const earlier = S()
        .entries.filter((e) => e.cycle < now)
        .map((e) => e.cycle);
      return earlier.length > 0 ? Math.max(...earlier) : null;
    },

    addFuelCans(
      input: AddFuelCansInput & { actorId: string },
    ): PowerWriteResult<{ count: number }> {
      return write(input.actorId, (cycle) => {
        const mine = S().cans.filter((c) => c.cycle === cycle);
        const numbers = mine
          .map((c) => /^Can (\d{1,6})$/.exec(c.label)?.[1])
          .filter((n): n is string => n !== undefined)
          .map(Number);
        const first = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
        const base =
          mine.length > 0 ? Math.max(...mine.map((c) => c.sort)) + 1 : 0;
        for (let i = 0; i < input.count; i++) {
          S().cans.push({
            id: crypto.randomUUID(),
            cycle,
            label: `Can ${first + i}`,
            capacityLitres: input.capacityLitres,
            litres: input.litres,
            location: input.location,
            sort: base + i,
            version: 1,
            createdAt: new Date(),
          });
        }
        return { count: input.count };
      });
    },

    updateFuelCan(
      input: EditFuelCanInput & { actorId: string },
    ): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const can = canOf(cycle, input.canId);
        if (!can) return CAN_GONE;
        if (can.version !== input.expectedVersion) return CAN_CHANGED;
        Object.assign(can, {
          label: input.label,
          capacityLitres: input.capacityLitres,
          litres: input.litres,
          location: input.location,
          version: can.version + 1,
        });
        return {};
      });
    },

    removeFuelCan(input: {
      actorId: string;
      canId: string;
      expectedVersion: number;
    }): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const can = canOf(cycle, input.canId);
        if (!can) return CAN_GONE;
        if (can.version !== input.expectedVersion) return CAN_CHANGED;
        S().cans.splice(S().cans.indexOf(can), 1);
        for (const e of S().entries) {
          if (e.fromCanId === can.id) e.fromCanId = null;
        }
        return {};
      });
    },

    logRefuel(
      input: RefuelInput & { actorId: string; now?: Date },
    ): PowerWriteResult<{ id: string }> {
      return write(input.actorId, (cycle) => {
        const ready = prepare(cycle, input, input.now ?? new Date());
        if (typeof ready === "string") return ready;
        ready.take();
        const id = crypto.randomUUID();
        S().entries.push({
          ...entryValues(cycle, input, ready.at),
          id,
          correctsEntryId: null,
          voided: false,
          createdAt: new Date(),
        });
        return { id };
      });
    },

    correctRefuel(
      input: CorrectRefuelInput & { actorId: string; now?: Date },
    ): PowerWriteResult<{ id: string }> {
      return write(input.actorId, (cycle) => {
        const old = claim(cycle, input.correctsEntryId);
        if (typeof old === "string") return old;
        // The db puts the old litres back before it checks the new can; so
        // does the store, and undoes it if the new entry is refused.
        const before = S().cans.map((c) => ({ ...c }));
        giveBack(old);
        const ready = prepare(cycle, input, input.now ?? new Date());
        if (typeof ready === "string") {
          S().cans.splice(0, S().cans.length, ...before);
          return ready;
        }
        ready.take();
        const id = crypto.randomUUID();
        S().entries.push({
          ...entryValues(cycle, input, ready.at),
          id,
          correctsEntryId: old.id,
          voided: false,
          createdAt: new Date(),
        });
        return { id };
      });
    },

    strikeRefuel(
      input: StrikeRefuelInput & { actorId: string },
    ): PowerWriteResult<{ id: string }> {
      return write(input.actorId, (cycle) => {
        const old = claim(cycle, input.entryId);
        if (typeof old === "string") return old;
        giveBack(old);
        const id = crypto.randomUUID();
        S().entries.push({
          ...old,
          id,
          fromCanId: null,
          note: input.note,
          correctsEntryId: old.id,
          voided: true,
          createdAt: new Date(),
        });
        return { id };
      });
    },

    // --- The grid plan (#256) ----------------------------------------------

    listGridNodes(cycle?: number): GridNodeRow[] {
      return nodesOf(cycle ?? d.cycle())
        .sort((a, b) => a.sort - b.sort)
        .map(({ createdAt: _c, ...n }) => ({ ...n }));
    },

    listLoadGridPoints(cycle?: number): Record<string, string> {
      const year = cycle ?? d.cycle();
      const loads = new Set(
        d
          .loads()
          .filter((l) => l.cycle === year)
          .map((l) => l.id),
      );
      return Object.fromEntries(
        [...S().loadPoints].filter(([loadId]) => loads.has(loadId)),
      );
    },

    previousGridCycle(): number | null {
      const now = d.cycle();
      const earlier = S()
        .nodes.filter((n) => n.cycle < now)
        .map((n) => n.cycle);
      return earlier.length > 0 ? Math.max(...earlier) : null;
    },

    addGridNode(
      input: GridNodeInput & { actorId: string },
    ): PowerWriteResult<{ id: string }> {
      return write(input.actorId, (cycle) => {
        const refusal = parentRefusal(cycle, input.parentId);
        if (refusal) return refusal;
        const mine = nodesOf(cycle);
        const id = crypto.randomUUID();
        S().nodes.push({
          ...nodeFields(input),
          id,
          cycle,
          sort: mine.length > 0 ? Math.max(...mine.map((n) => n.sort)) + 1 : 0,
          version: 1,
          createdAt: new Date(),
        });
        return { id };
      });
    },

    updateGridNode(
      input: EditGridNodeInput & { actorId: string },
    ): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const nodes = nodesOf(cycle);
        const self = nodes.find((n) => n.id === input.nodeId);
        if (!self) return GRID_NODE_GONE;
        if ((self.kind === "generator") !== (input.kind === "generator")) {
          return GRID_KIND_FIXED;
        }
        const refusal = parentRefusal(cycle, input.parentId);
        if (refusal) return refusal;
        if (
          input.parentId !== null &&
          wouldLoop(nodes, input.nodeId, input.parentId)
        ) {
          return GRID_LOOP;
        }
        if (
          input.kind === "end_point" &&
          nodes.some((n) => n.parentId === input.nodeId)
        ) {
          return GRID_FEEDS_OTHERS;
        }
        if (self.version !== input.expectedVersion) return GRID_NODE_CHANGED;
        Object.assign(self, nodeFields(input), { version: self.version + 1 });
        return {};
      });
    },

    removeGridNode(input: {
      actorId: string;
      nodeId: string;
      expectedVersion: number;
    }): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const nodes = nodesOf(cycle);
        const self = nodes.find((n) => n.id === input.nodeId);
        if (!self) return GRID_NODE_GONE;
        if (nodes.some((n) => n.parentId === input.nodeId)) {
          return GRID_FEEDS_OTHERS;
        }
        if (self.version !== input.expectedVersion) return GRID_NODE_CHANGED;
        S().nodes.splice(S().nodes.indexOf(self), 1);
        for (const [loadId, nodeId] of S().loadPoints) {
          if (nodeId === self.id) S().loadPoints.delete(loadId);
        }
        return {};
      });
    },

    assignLoadToGridNode(input: {
      actorId: string;
      loadId: string;
      nodeId: string | null;
    }): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        if (
          input.nodeId !== null &&
          !nodesOf(cycle).some((n) => n.id === input.nodeId)
        ) {
          return GRID_NODE_GONE;
        }
        if (
          !d.loads().some((l) => l.id === input.loadId && l.cycle === cycle)
        ) {
          return LOAD_GONE;
        }
        if (input.nodeId === null) S().loadPoints.delete(input.loadId);
        else S().loadPoints.set(input.loadId, input.nodeId);
        return {};
      });
    },

    copyLastYearGrid(input: {
      actorId: string;
    }): PowerWriteResult<{ count: number }> {
      return write(input.actorId, (cycle) => {
        if (nodesOf(cycle).length > 0) return ALREADY_HAS_GRID;
        const earlier = S()
          .nodes.filter((n) => n.cycle < cycle)
          .map((n) => n.cycle);
        if (earlier.length === 0) return NOTHING_TO_COPY;
        const from = nodesOf(Math.max(...earlier));
        const ids = new Map(from.map((n) => [n.id, crypto.randomUUID()]));
        for (const n of from) {
          S().nodes.push({
            ...n,
            id: ids.get(n.id)!,
            cycle,
            parentId: n.parentId ? (ids.get(n.parentId) ?? null) : null,
            version: 1,
            createdAt: new Date(),
          });
        }
        return { count: from.length };
      });
    },

    // --- Readiness, the work plan and sharing (#257) -----------------------

    listReadinessItems(cycle?: number): ReadinessItemRow[] {
      const year = cycle ?? d.cycle();
      return S()
        .items.filter((i) => i.cycle === year)
        .sort((a, b) => a.sort - b.sort)
        .map(({ doneByUserId, ...i }) => ({
          ...i,
          ownerName: name(i.ownerUserId),
          doneByName: name(doneByUserId),
        }));
    },

    startReadinessChecklist(input: {
      actorId: string;
      generatorId: string;
    }): PowerWriteResult<{ count: number }> {
      return write(input.actorId, (cycle) => {
        if (!liveGenerator(input.generatorId)) return GENERATOR_GONE;
        if (itemsOf(cycle, input.generatorId).length > 0) {
          return READINESS_ALREADY_STARTED;
        }
        READINESS_TEMPLATE.forEach((item, sort) => {
          S().items.push({
            id: crypto.randomUUID(),
            cycle,
            generatorId: input.generatorId,
            itemKey: item.key,
            label: item.label,
            ownerUserId: null,
            dueOn: null,
            doneAt: null,
            doneByUserId: null,
            sort,
            version: 1,
          });
        });
        return { count: READINESS_TEMPLATE.length };
      });
    },

    addReadinessItem(
      input: AddReadinessItemInput & { actorId: string },
    ): PowerWriteResult<{ id: string }> {
      return write(input.actorId, (cycle) => {
        if (!liveGenerator(input.generatorId)) return GENERATOR_GONE;
        const mine = itemsOf(cycle, input.generatorId);
        const id = crypto.randomUUID();
        S().items.push({
          id,
          cycle,
          generatorId: input.generatorId,
          itemKey: CUSTOM_READINESS_KEY,
          label: input.label,
          ownerUserId: null,
          dueOn: null,
          doneAt: null,
          doneByUserId: null,
          sort: mine.length > 0 ? Math.max(...mine.map((i) => i.sort)) + 1 : 0,
          version: 1,
        });
        return { id };
      });
    },

    updateReadinessItem(
      input: EditReadinessItemInput & { actorId: string },
    ): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        if (input.ownerUserId !== null && !approved(input.ownerUserId)) {
          return READINESS_OWNER_NOT_MEMBER;
        }
        const item = S().items.find(
          (i) =>
            i.id === input.itemId &&
            i.cycle === cycle &&
            i.version === input.expectedVersion,
        );
        if (!item) return itemLoss(cycle, input.itemId);
        Object.assign(item, {
          ownerUserId: input.ownerUserId,
          dueOn: input.dueOn,
          version: item.version + 1,
        });
        return {};
      });
    },

    tickReadinessItem(input: {
      actorId: string;
      itemId: string;
      done: boolean;
    }): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const item = S().items.find(
          (i) => i.id === input.itemId && i.cycle === cycle,
        );
        if (!item) return READINESS_ITEM_GONE;
        if ((item.doneAt === null) !== input.done)
          return READINESS_TICKED_FIRST;
        Object.assign(item, {
          doneAt: input.done ? new Date() : null,
          doneByUserId: input.done ? input.actorId : null,
          version: item.version + 1,
        });
        return {};
      });
    },

    removeReadinessItem(input: {
      actorId: string;
      itemId: string;
      expectedVersion: number;
    }): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const i = S().items.findIndex(
          (item) =>
            item.id === input.itemId &&
            item.cycle === cycle &&
            item.version === input.expectedVersion,
        );
        if (i === -1) return itemLoss(cycle, input.itemId);
        S().items.splice(i, 1);
        return {};
      });
    },

    listWorkPlanTasks(cycle?: number): WorkPlanTaskRow[] {
      const year = cycle ?? d.cycle();
      return S()
        .workPlan.filter((w) => w.cycle === year)
        .sort((a, b) => a.sort - b.sort)
        .flatMap((w) => {
          const task = d.task(w.taskId);
          if (!task || task.status === "cancelled") return [];
          return [
            {
              taskId: w.taskId,
              title: task.title,
              status: task.status,
              assigneeName: name(task.assigneeId),
              dueAt: task.dueAt,
            },
          ];
        });
    },

    previousWorkPlanCycle(): number | null {
      const now = d.cycle();
      const earlier = S()
        .workPlan.filter((w) => w.cycle < now)
        .map((w) => w.cycle);
      return earlier.length > 0 ? Math.max(...earlier) : null;
    },

    addWorkPlanToBoard(input: {
      actorId: string;
    }): PowerWriteResult<{ count: number; fromCycle: number | null }> {
      return write(input.actorId, (cycle) => {
        if (S().workPlan.some((w) => w.cycle === cycle)) {
          return WORK_PLAN_ALREADY_ON_BOARD;
        }
        const earlier = S()
          .workPlan.filter((w) => w.cycle < cycle)
          .map((w) => w.cycle);
        const fromCycle = earlier.length > 0 ? Math.max(...earlier) : null;
        let plan: { title: string; description: string | null }[] =
          POWER_WORK_PLAN_TEMPLATE.map((t) => ({ ...t }));
        if (fromCycle !== null) {
          const last = S()
            .workPlan.filter((w) => w.cycle === fromCycle)
            .sort((a, b) => a.sort - b.sort)
            .map((w) => d.task(w.taskId))
            .filter((t) => t !== null)
            .map((t) => ({ title: t.title, description: t.description }));
          if (last.length > 0) plan = last;
        }
        const made: string[] = [];
        for (const task of plan) {
          const added = d.addTask({
            creatorId: input.actorId,
            title: task.title,
            description: task.description,
            team: POWER_TEAM as Team,
            assigneeId: null,
            dueAt: null,
          });
          if (!added.ok) return added.error;
          made.push(added.id);
        }
        made.forEach((taskId, sort) =>
          S().workPlan.push({ cycle, taskId, sort }),
        );
        return { count: made.length, fromCycle };
      });
    },

    getSharingAgreement(cycle?: number): SharingAgreement | null {
      const row = S().agreements.get(cycle ?? d.cycle());
      return row ? { ...row } : null;
    },

    saveSharingAgreement(
      input: SharingAgreementInput & { actorId: string },
    ): PowerWriteResult<{ version: number }> {
      return write(input.actorId, (cycle) => {
        if (input.generatorId !== null && !liveGenerator(input.generatorId)) {
          return GENERATOR_GONE;
        }
        const existing = S().agreements.get(cycle);
        if ((existing?.version ?? 0) !== input.expectedVersion) {
          return SHARING_CHANGED;
        }
        const version = input.expectedVersion + 1;
        S().agreements.set(cycle, {
          cycle,
          partnerCamp: input.partnerCamp,
          contactRole: input.contactRole,
          generatorSource: input.generatorSource,
          generatorId: input.generatorId,
          theirGenerator: input.theirGenerator,
          partnerFuelPct: input.partnerFuelPct,
          watchCover: input.watchCover,
          version,
          updatedAt: new Date(),
        });
        return { version };
      });
    },

    removeSharingAgreement(input: {
      actorId: string;
      expectedVersion: number;
    }): PowerWriteResult {
      return write(input.actorId, (cycle) => {
        const existing = S().agreements.get(cycle);
        if (!existing) return SHARING_GONE;
        if (existing.version !== input.expectedVersion) return SHARING_CHANGED;
        S().agreements.delete(cycle);
        return {};
      });
    },
  };
}
