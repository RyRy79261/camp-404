import { POWER_EDITOR } from "@camp404/core";
import {
  ALREADY_HAS_LOADS,
  ALREADY_HAS_PLAN,
  NOTHING_TO_COPY,
} from "@camp404/db/power";
import { ALREADY_HAS_GRID } from "@camp404/db/power-grid";
import { WORK_PLAN_ALREADY_ON_BOARD } from "@camp404/db/power-readiness";
import { scopeActor } from "../mcp/scope";
import {
  getGenerator,
  getPowerPlan,
  listPowerLoads,
  previousLoadCycle,
  previousPlanCycle,
} from "../power";
import {
  GRID_KIND_LABELS,
  POWER_FUEL_PATH,
  POWER_GRID_PATH,
  POWER_HOME_PATH,
  POWER_LOADS_PATH,
  POWER_READINESS_PATH,
  POWER_REFUELLING_PATH,
  POWER_REFUSAL,
  POWER_SHARING_PATH,
  cansText,
  materialText,
  watts,
} from "../power-copy";
import {
  getSharingAgreement,
  listFuelCans,
  listGridNodes,
  listReadinessItems,
  listWorkPlanTasks,
  previousGridCycle,
} from "../power-site";
import {
  blocked,
  dayLabel,
  personName,
  quote,
  shown,
  str,
  type Args,
  type Preview,
  type PreviewCtx,
  type PreviewFn,
} from "./preview-kit";

// What the person reads before Do for each Power save (tools/power.ts). Every
// sentence and fact comes from the rows as they stand, never from Claude's
// words; an edit's `expectedVersion` is filled in from the row read here, so
// Do changes only what was shown.

/** The fields a call sets, one line each ("wattsEach: 120"). */
function changeLines(args: Args, skip: readonly string[]): string[] {
  return Object.entries(args)
    .filter(([key, value]) => !skip.includes(key) && value !== undefined)
    .map(([key, value]) => `${key}: ${shown(value)}`);
}

const ID_KEYS = [
  "loadId",
  "generatorId",
  "nodeId",
  "itemId",
  "canId",
  "expectedVersion",
];

/** The person may not save Power: the row says why before Do. */
function notEditor(
  sentence: string,
  args: Args,
  path: string,
  ctx: PreviewCtx,
): Preview | null {
  return POWER_EDITOR.allows(scopeActor(ctx.scope))
    ? null
    : blocked(sentence, POWER_REFUSAL, args, path);
}

async function findLoad(id: string) {
  return (await listPowerLoads()).find((l) => l.id === id) ?? null;
}

async function liveGenerator(id: string) {
  if (!id) return null;
  const generator = await getGenerator(id);
  return generator && !generator.archivedAt ? generator : null;
}

const savePowerLoad: PreviewFn = async (args, ctx) => {
  const loadId = str(args.loadId);
  if (!loadId) {
    const sentence = `Add the load ${quote(str(args.name))} to this year's list`;
    const denied = notEditor(sentence, args, POWER_LOADS_PATH, ctx);
    if (denied) return denied;
    const quantity = typeof args.quantity === "number" ? args.quantity : 1;
    const each = typeof args.wattsEach === "number" ? args.wattsEach : 0;
    return {
      sentence,
      facts: `Power · loads · ${quantity} × ${watts(each)}${args.area ? ` · ${str(args.area)}` : ""}`,
      change: changeLines(args, ID_KEYS),
      path: POWER_LOADS_PATH,
      args,
      keys: ["power-loads"],
    };
  }
  const load = await findLoad(loadId);
  if (!load) {
    return blocked(
      "Change a power load",
      "That load isn't on this year's list.",
      args,
      POWER_LOADS_PATH,
    );
  }
  const sentence = `Change the load ${quote(load.name)}`;
  const denied = notEditor(sentence, args, POWER_LOADS_PATH, ctx);
  if (denied) return denied;
  return {
    sentence,
    facts: `Power · loads · now ${load.quantity} × ${watts(load.wattsEach)} · ${load.area}`,
    change: changeLines(args, ID_KEYS),
    path: POWER_LOADS_PATH,
    args: { ...args, expectedVersion: load.version },
    keys: [`power-load:${load.id}`],
  };
};

const plugInPowerLoad: PreviewFn = async (args, ctx) => {
  const load = await findLoad(str(args.loadId));
  if (!load) {
    return blocked(
      "Plug a load in on the grid",
      "That load isn't on this year's list.",
      args,
      POWER_GRID_PATH,
    );
  }
  const nodeId = args.nodeId === null ? null : str(args.nodeId);
  const node =
    nodeId === null
      ? null
      : ((await listGridNodes()).find((n) => n.id === nodeId) ?? null);
  if (nodeId !== null && !node) {
    return blocked(
      `Plug ${quote(load.name)} in on the grid`,
      "That point isn't on this year's grid.",
      args,
      POWER_GRID_PATH,
    );
  }
  const sentence = node
    ? `Plug ${quote(load.name)} in at ${quote(node.name)}`
    : `Take ${quote(load.name)} off the grid`;
  const denied = notEditor(sentence, args, POWER_GRID_PATH, ctx);
  if (denied) return denied;
  return {
    sentence,
    facts: node
      ? `Power · grid · ${GRID_KIND_LABELS[node.kind].toLowerCase()} · ${load.quantity} × ${watts(load.wattsEach)}`
      : "Power · grid · it stays on the load list",
    path: POWER_GRID_PATH,
    args: { loadId: load.id, nodeId },
    keys: [`power-load:${load.id}`],
    needs: node
      ? [`power-load:${load.id}`, `grid-node:${node.id}`]
      : [`power-load:${load.id}`],
  };
};

const saveGenerator: PreviewFn = async (args, ctx) => {
  const id = str(args.generatorId);
  if (!id) {
    const sentence = `Add the generator ${quote(str(args.model))} to the camp's gear`;
    const denied = notEditor(sentence, args, POWER_FUEL_PATH, ctx);
    if (denied) return denied;
    return {
      sentence,
      facts: `Power · generators · ${typeof args.ratedKva === "number" ? `${args.ratedKva} kVA rated` : "rating not given"}`,
      change: changeLines(args, ID_KEYS),
      path: POWER_FUEL_PATH,
      args,
      keys: ["generators"],
    };
  }
  const generator = await liveGenerator(id);
  if (!generator) {
    return blocked(
      "Change a generator",
      "That generator isn't in service.",
      args,
      POWER_FUEL_PATH,
    );
  }
  const sentence = `Change the generator ${quote(generator.model)}`;
  const denied = notEditor(sentence, args, POWER_FUEL_PATH, ctx);
  if (denied) return denied;
  return {
    sentence,
    facts: `Power · generators · now ${generator.ratedKva} kVA rated, ${generator.tankLitres} L tank, ${generator.fuelType}`,
    change: changeLines(args, ID_KEYS),
    path: POWER_FUEL_PATH,
    args: { ...args, expectedVersion: generator.version },
    keys: [`generator:${generator.id}`],
  };
};

const setPowerPlan: PreviewFn = async (args, ctx) => {
  const sentence = "Change this year's power plan";
  const denied = notEditor(sentence, args, POWER_FUEL_PATH, ctx);
  if (denied) return denied;
  const plan = await getPowerPlan();
  const generator = plan.generatorId
    ? await getGenerator(plan.generatorId)
    : null;
  const change = changeLines(args, ["expectedVersion"]);
  if (change.length === 0) {
    return blocked(
      sentence,
      "Say what to change in the plan.",
      args,
      POWER_FUEL_PATH,
    );
  }
  return {
    sentence,
    facts: `Power · plan · now ${generator ? quote(generator.model) : "no generator"}, ${plan.daysOnSite} days on site${plan.version === 0 ? " · not saved yet" : ""}`,
    change,
    path: POWER_FUEL_PATH,
    args: { ...args, expectedVersion: plan.version },
    keys: ["power-plan"],
  };
};

const COPY_WHAT: Record<string, { label: string; path: string }> = {
  loads: { label: "load list", path: POWER_LOADS_PATH },
  plan: { label: "plan", path: POWER_FUEL_PATH },
  grid: { label: "grid plan", path: POWER_GRID_PATH },
};

const copyPowerLastYear: PreviewFn = async (args, ctx) => {
  const what = str(args.what);
  const target = COPY_WHAT[what];
  if (!target) {
    return blocked(
      "Copy last year's power plan",
      "Say loads, plan or grid.",
      args,
      POWER_HOME_PATH,
    );
  }
  const sentence = `Copy last year's ${target.label} into this year`;
  const denied = notEditor(sentence, args, target.path, ctx);
  if (denied) return denied;
  let here: boolean;
  let from: number | null;
  let already: string;
  if (what === "loads") {
    [here, from] = await Promise.all([
      listPowerLoads().then((l) => l.length > 0),
      previousLoadCycle(),
    ]);
    already = ALREADY_HAS_LOADS;
  } else if (what === "plan") {
    [here, from] = await Promise.all([
      getPowerPlan().then((p) => p.version > 0),
      previousPlanCycle(),
    ]);
    already = ALREADY_HAS_PLAN;
  } else {
    [here, from] = await Promise.all([
      listGridNodes().then((n) => n.length > 0),
      previousGridCycle(),
    ]);
    already = ALREADY_HAS_GRID;
  }
  const base = {
    sentence,
    facts: from === null ? "Power · no earlier year" : `Power · from ${from}`,
    path: target.path,
    args: { what },
    keys: [what === "plan" ? "power-plan" : `power-${what}`],
  };
  if (here) return { ...base, blocked: already };
  if (from === null) return { ...base, blocked: NOTHING_TO_COPY };
  return base;
};

const saveGridNode: PreviewFn = async (args, ctx) => {
  const nodes = await listGridNodes();
  const nameOf = (id: unknown) =>
    nodes.find((n) => n.id === str(id))?.name ?? null;
  const id = str(args.nodeId);
  if (!id) {
    const sentence = `Add the point ${quote(str(args.name))} to this year's grid`;
    const denied = notEditor(sentence, args, POWER_GRID_PATH, ctx);
    if (denied) return denied;
    const parent = nameOf(args.parentId);
    return {
      sentence,
      facts: `Power · grid${parent ? ` · fed from ${quote(parent)}` : ""}`,
      change: changeLines(args, ID_KEYS),
      path: POWER_GRID_PATH,
      args,
      keys: ["power-grid"],
    };
  }
  const node = nodes.find((n) => n.id === id);
  if (!node) {
    return blocked(
      "Change a grid point",
      "That point isn't on this year's grid.",
      args,
      POWER_GRID_PATH,
    );
  }
  const sentence = `Change the grid point ${quote(node.name)}`;
  const denied = notEditor(sentence, args, POWER_GRID_PATH, ctx);
  if (denied) return denied;
  const parent = nameOf(node.parentId);
  return {
    sentence,
    facts: `Power · grid · ${GRID_KIND_LABELS[node.kind].toLowerCase()}${parent ? `, fed from ${quote(parent)}` : ""}`,
    change: changeLines(args, ID_KEYS),
    path: POWER_GRID_PATH,
    args: { ...args, expectedVersion: node.version },
    keys: [`grid-node:${node.id}`],
  };
};

const startReadinessChecklist: PreviewFn = async (args, ctx) => {
  const generator = await liveGenerator(str(args.generatorId));
  if (!generator) {
    return blocked(
      "Start a generator's readiness checklist",
      "That generator isn't in service.",
      args,
      POWER_READINESS_PATH,
    );
  }
  const sentence = `Start the readiness checklist for ${quote(generator.model)}`;
  const denied = notEditor(sentence, args, POWER_READINESS_PATH, ctx);
  if (denied) return denied;
  const started = (await listReadinessItems()).some(
    (i) => i.generatorId === generator.id,
  );
  const base = {
    sentence,
    facts: "Power · readiness · the team's standard checks, nobody on them yet",
    path: POWER_READINESS_PATH,
    args: { generatorId: generator.id },
    keys: [`readiness:${generator.id}`],
  };
  return started
    ? { ...base, blocked: "Its checklist is already started this year." }
    : base;
};

const saveReadinessItem: PreviewFn = async (args, ctx) => {
  const itemId = str(args.itemId);
  if (!itemId) {
    const generator = await liveGenerator(str(args.generatorId));
    if (!generator) {
      return blocked(
        "Add a readiness check",
        "That generator isn't in service.",
        args,
        POWER_READINESS_PATH,
      );
    }
    const sentence = `Add ${quote(str(args.label))} to the checklist for ${quote(generator.model)}`;
    const denied = notEditor(sentence, args, POWER_READINESS_PATH, ctx);
    if (denied) return denied;
    return {
      sentence,
      facts: "Power · readiness · nobody on it yet",
      path: POWER_READINESS_PATH,
      args,
      keys: [`readiness:${generator.id}`],
    };
  }
  const item = (await listReadinessItems()).find((i) => i.id === itemId);
  if (!item) {
    return blocked(
      "Change a readiness check",
      "That check isn't on this year's checklist.",
      args,
      POWER_READINESS_PATH,
    );
  }
  const owner =
    args.ownerUserId === undefined
      ? null
      : args.ownerUserId === null
        ? "nobody"
        : await personName(args.ownerUserId);
  const due =
    args.dueOn === undefined
      ? null
      : args.dueOn === null
        ? "no date"
        : dayLabel(str(args.dueOn));
  const parts = [
    owner !== null ? `on ${owner}` : null,
    due !== null ? `by ${due}` : null,
  ].filter((p): p is string => p !== null);
  const sentence = `Put ${quote(item.label)} ${parts.length > 0 ? parts.join(", ") : "as it is"}`;
  const denied = notEditor(sentence, args, POWER_READINESS_PATH, ctx);
  if (denied) return denied;
  return {
    sentence,
    facts: `Power · readiness · now ${item.ownerName ?? "nobody"}, ${item.dueOn ? `by ${dayLabel(item.dueOn)}` : "no date"}`,
    path: POWER_READINESS_PATH,
    args: { ...args, expectedVersion: item.version },
    keys: [`readiness-item:${item.id}`],
  };
};

const tickReadinessItem: PreviewFn = async (args, ctx) => {
  const item = (await listReadinessItems()).find(
    (i) => i.id === str(args.itemId),
  );
  if (!item) {
    return blocked(
      "Tick a readiness check",
      "That check isn't on this year's checklist.",
      args,
      POWER_READINESS_PATH,
    );
  }
  const done = args.done === true;
  const sentence = done
    ? `Tick ${quote(item.label)} done`
    : `Untick ${quote(item.label)}`;
  const denied = notEditor(sentence, args, POWER_READINESS_PATH, ctx);
  if (denied) return denied;
  const base = {
    sentence,
    facts: `Power · readiness${item.ownerName ? ` · ${item.ownerName} sees to it` : ""}`,
    path: POWER_READINESS_PATH,
    args: { itemId: item.id, done },
    keys: [`readiness-item:${item.id}`],
  };
  const isDone = item.doneAt !== null;
  if (isDone === done) {
    return {
      ...base,
      blocked: done ? "It is already ticked." : "It isn't ticked.",
    };
  }
  return base;
};

const addPowerWorkPlan: PreviewFn = async (args, ctx) => {
  const sentence =
    "Put this year's Power & Lighting work plan on the task board";
  const denied = notEditor(sentence, args, POWER_READINESS_PATH, ctx);
  if (denied) return denied;
  const here = (await listWorkPlanTasks()).length > 0;
  const base = {
    sentence,
    facts: "Tasks · Power & Lighting · nobody on them yet",
    path: POWER_READINESS_PATH,
    args: {},
    keys: ["power-work-plan"],
  };
  return here ? { ...base, blocked: WORK_PLAN_ALREADY_ON_BOARD } : base;
};

const savePowerSharing: PreviewFn = async (args, ctx) => {
  const current = await getSharingAgreement();
  const camp = str(args.partnerCamp) || current?.partnerCamp || "";
  const sentence = current
    ? `Change the power sharing agreement with ${quote(camp)}`
    : `Save a power sharing agreement with ${quote(camp)}`;
  const denied = notEditor(sentence, args, POWER_SHARING_PATH, ctx);
  if (denied) return denied;
  return {
    sentence,
    facts: current
      ? `Power · sharing · now ${current.generatorSource === "ours" ? "our generator" : "their generator"}`
      : "Power · sharing · none saved this year",
    change: changeLines(args, ["expectedVersion"]),
    path: POWER_SHARING_PATH,
    args: { ...args, expectedVersion: current?.version ?? 0 },
    keys: ["power-sharing"],
  };
};

const saveFuelCan: PreviewFn = async (args, ctx) => {
  const canId = str(args.canId);
  const owner =
    args.ownerUserId === undefined
      ? null
      : args.ownerUserId === null
        ? "the camp"
        : await personName(args.ownerUserId);
  if (!canId) {
    const size = typeof args.sizeLitres === "number" ? args.sizeLitres : 0;
    const material =
      args.material === "metal" || args.material === "plastic"
        ? args.material
        : null;
    const sentence = `Add a ${size} L ${materialText(material).toLowerCase()} fuel can, ${owner ?? "the camp"}'s`;
    const denied = notEditor(sentence, args, POWER_REFUELLING_PATH, ctx);
    if (denied) return denied;
    const count = (await listFuelCans()).length;
    return {
      sentence,
      facts: `Power · fuel cans · ${cansText(count)} on the list now`,
      change: changeLines(args, ID_KEYS),
      path: POWER_REFUELLING_PATH,
      args,
      keys: ["fuel-cans"],
    };
  }
  const cans = await listFuelCans();
  const index = cans.findIndex((c) => c.id === canId);
  const can = cans[index];
  if (!can) {
    return blocked(
      "Change a fuel can",
      "That can isn't on this year's list.",
      args,
      POWER_REFUELLING_PATH,
    );
  }
  const sentence = `Change fuel can ${index + 1}`;
  const denied = notEditor(sentence, args, POWER_REFUELLING_PATH, ctx);
  if (denied) return denied;
  return {
    sentence,
    facts: `Power · fuel cans · now ${can.sizeLitres} L, ${materialText(can.material).toLowerCase()}, ${can.ownerUserId ? (can.ownerName ?? "a member") : "the camp"}'s`,
    change: changeLines(args, ID_KEYS),
    path: POWER_REFUELLING_PATH,
    args: { ...args, expectedVersion: can.version },
    keys: [`fuel-can:${can.id}`],
  };
};

export const POWER_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  save_power_load: savePowerLoad,
  plug_in_power_load: plugInPowerLoad,
  save_generator: saveGenerator,
  set_power_plan: setPowerPlan,
  copy_power_last_year: copyPowerLastYear,
  save_grid_node: saveGridNode,
  start_readiness_checklist: startReadinessChecklist,
  save_readiness_item: saveReadinessItem,
  tick_readiness_item: tickReadinessItem,
  add_power_work_plan: addPowerWorkPlan,
  save_power_sharing: savePowerSharing,
  save_fuel_can: saveFuelCan,
};
