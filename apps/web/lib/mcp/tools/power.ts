import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { POWER_EDITOR } from "@camp404/core";
import {
  GENERATOR_CHANGED,
  GENERATOR_GONE,
  LOAD_CHANGED,
  LOAD_GONE,
  NOT_A_POWER_EDITOR,
  PLAN_CHANGED,
} from "@camp404/db/power";
import { GRID_NODE_CHANGED, GRID_NODE_GONE } from "@camp404/db/power-grid";
import {
  READINESS_ITEM_CHANGED,
  READINESS_ITEM_GONE,
  SHARING_CHANGED,
} from "@camp404/db/power-readiness";
import { CAN_CHANGED, CAN_GONE } from "@camp404/db/power-site";
import {
  AddReadinessItemInput,
  CAN_MATERIALS,
  CURRENT_KINDS,
  EditFuelCanInput,
  EditGeneratorInput,
  EditGridNodeInput,
  EditLoadInput,
  EditReadinessItemInput,
  FUEL_TYPES,
  FuelCanInput,
  GENERATOR_OWNERS,
  GeneratorInput,
  GRID_NODE_KINDS,
  GridNodeInput,
  LOAD_CATEGORIES,
  LOAD_OWNERS,
  LOAD_SCHEDULES,
  LoadInput,
  PowerPlanInput,
  SHARE_GENERATOR_SOURCES,
  SharingAgreementInput,
} from "@camp404/types";
import {
  addGenerator,
  addPowerLoad,
  copyLastYearLoads,
  copyLastYearPlan,
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerLoads,
  setPowerPlan,
  updateGenerator,
  updatePowerLoad,
} from "../../power";
import {
  CHECK_CANS,
  CHECK_GENERATOR,
  CHECK_GRID,
  CHECK_LOAD,
  CHECK_PLAN,
  CHECK_READINESS,
  CHECK_SHARING,
  POWER_FUEL_PATH,
  POWER_GRID_PATH,
  POWER_HOME_PATH,
  POWER_LOADS_PATH,
  POWER_READINESS_PATH,
  POWER_REFUELLING_PATH,
  POWER_SHARING_PATH,
} from "../../power-copy";
import {
  addFuelCan,
  addGridNode,
  addReadinessItem,
  addWorkPlanToBoard,
  assignLoadToGridNode,
  copyLastYearGrid,
  getSharingAgreement,
  listFuelCans,
  listGridNodes,
  listLoadGridPoints,
  listReadinessItems,
  listWorkPlanTasks,
  saveSharingAgreement,
  startReadinessChecklist,
  tickReadinessItem,
  updateFuelCan,
  updateGridNode,
  updateReadinessItem,
} from "../../power-site";
import { siteUrl } from "../capabilities";
import { scopeActor } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The Power program (#253–#257) over the connector, on its pages' rules and
// through their own functions (@/lib/power, @/lib/power-site):
//
//  - Every approved member reads it, as the Power pages show it to them
//    (get_power_plan): ids and versions, so a save can name what it read.
//  - Every save is the page's own write, behind the page's gate
//    (POWER_EDITOR: a captain or a Power & Lighting lead, tool-caps/power.ts),
//    and each write checks the actor again inside its own transaction. Only
//    the actor's id is passed, never a rank or a team list.
//  - A change names the version the caller read; the tool fills the fields
//    left out from the row AT that version (a call on an older one is
//    refused), so a partial change never writes back a stale field. The plan
//    is checked merged onto the current plan, as the page does, and only the
//    fields given are sent.
//  - The fuel can register's writes leave their audit row (the db's own);
//    loads, generators, the plan, the grid and readiness keep none, as on
//    the page.
//  - Removing a load, a point, a check, a can or the sharing agreement, and
//    retiring a generator, stay on the website (no undo).

const firstIssue = (error: z.ZodError, fallback: string) =>
  error.issues[0]?.message ?? fallback;

/** The page's refusal, with the page when it is the editor rule. */
function refused(error: string, path: string): never {
  throw new ToolError(
    error === NOT_A_POWER_EDITOR
      ? `${error} On the website: ${siteUrl(path)}`
      : error,
  );
}

/**
 * The whole row the page's edit form sends: each key from the call when it
 * was given (null included), else from the row as it stands (an add has no
 * row, so a key left out stays out and the schema's default or message
 * applies).
 */
function fill<K extends string>(
  keys: readonly K[],
  args: Record<string, unknown>,
  row: Partial<Record<K, unknown>> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (args[key] !== undefined) out[key] = args[key];
    else if (row && row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

const given = (keys: readonly string[], args: Record<string, unknown>) =>
  keys.filter((k) => args[k] !== undefined);

const Id = z.string().uuid();
/** A member's id, as the page's pickers send it. */
const MemberId = z.string().min(1).max(100);
const Version = z.number().int().min(0);
const Hour = z.number().int().min(0).max(23);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// --- The fields each form sends ------------------------------------------------

export const LOAD_KEYS = [
  "name",
  "area",
  "category",
  "quantity",
  "wattsEach",
  "surgeWattsEach",
  "dutyPct",
  "schedule",
  "hoursPerDay",
  "windows",
  "fromDay",
  "toDay",
  "volts",
  "current",
  "owner",
  "neighbourCamp",
  "inventoryItemId",
  "circuit",
] as const;

export const GENERATOR_KEYS = [
  "model",
  "ratedKva",
  "maxKva",
  "tankLitres",
  "runtime50Hours",
  "runtime100Hours",
  "fuelType",
  "owner",
  "inventoryItemId",
  "noiseNote",
] as const;

/** The plan's fields the load list and the fuel page edit (never lowFuelDays). */
export const PLAN_KEYS = [
  "generatorId",
  "secondGeneratorNote",
  "runFromHour",
  "runToHour",
  "daysOnSite",
  "firstPoweredDay",
  "powerFactor",
  "lowLoadFactor",
  "safetyMarginPct",
  "canLitres",
  "cansOwned",
] as const;

export const GRID_KEYS = [
  "name",
  "kind",
  "parentId",
  "cable",
  "cableLengthM",
  "cableGaugeMm2",
  "cableRatedAmps",
  "adapter",
  "haveCable",
  "haveAdapter",
] as const;

export const SHARING_KEYS = [
  "partnerCamp",
  "contactRole",
  "generatorSource",
  "generatorId",
  "theirGenerator",
  "partnerFuelPct",
  "watchCover",
] as const;

export const CAN_KEYS = [
  "ownerUserId",
  "sizeLitres",
  "material",
  "travelsWithUserId",
  "note",
] as const;

/** A can's number on the printed sheet: its place in the year's list. */
export async function fuelCansNumbered() {
  const cans = await listFuelCans();
  return cans.map((can, i) => ({ ...can, number: i + 1 }));
}

export function registerPowerTools(server: McpServer): void {
  server.registerTool(
    "get_power_plan",
    {
      title: "Read this year's power plan",
      description:
        "This year's power plan as the Power pages show it: loads (with the grid point each plugs into), generators in service, the plan's settings, grid points, each generator's readiness checklist, the work plan's tasks, the fuel cans and the sharing agreement. Every row carries its id and `version`, which the save tools take. `youMayEdit` says whether you may change it.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_power_plan",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const [
            loads,
            where,
            plan,
            generators,
            nodes,
            items,
            workPlan,
            cans,
            sharing,
          ] = await Promise.all([
            listPowerLoads(),
            listLoadGridPoints(),
            getPowerPlan(),
            listGenerators(),
            listGridNodes(),
            listReadinessItems(),
            listWorkPlanTasks(),
            fuelCansNumbered(),
            getSharingAgreement(),
          ]);
          // The plan may name a generator retired since; it still reads.
          const planGenerator =
            plan.generatorId === null
              ? null
              : (generators.find((g) => g.id === plan.generatorId) ??
                (await getGenerator(plan.generatorId)));
          return {
            youMayEdit: POWER_EDITOR.allows(scopeActor(scope)),
            url: siteUrl(POWER_HOME_PATH),
            plan: {
              version: plan.version,
              generatorId: plan.generatorId,
              generatorModel: planGenerator?.model ?? null,
              secondGeneratorNote: plan.secondGeneratorNote,
              runFromHour: plan.runFromHour,
              runToHour: plan.runToHour,
              daysOnSite: plan.daysOnSite,
              firstPoweredDay: plan.firstPoweredDay,
              powerFactor: plan.powerFactor,
              lowLoadFactor: plan.lowLoadFactor,
              safetyMarginPct: plan.safetyMarginPct,
              canLitres: plan.canLitres,
              cansOwned: plan.cansOwned,
              lowFuelDays: plan.lowFuelDays,
              url: siteUrl(POWER_FUEL_PATH),
            },
            loads: loads.map((l) => ({
              id: l.id,
              version: l.version,
              ...Object.fromEntries(LOAD_KEYS.map((k) => [k, l[k]])),
              gridNodeId: where[l.id] ?? null,
            })),
            loadsUrl: siteUrl(POWER_LOADS_PATH),
            generators: generators.map((g) => ({
              id: g.id,
              version: g.version,
              ...Object.fromEntries(GENERATOR_KEYS.map((k) => [k, g[k]])),
            })),
            grid: nodes.map((n) => ({
              id: n.id,
              version: n.version,
              ...Object.fromEntries(GRID_KEYS.map((k) => [k, n[k]])),
            })),
            gridUrl: siteUrl(POWER_GRID_PATH),
            readiness: items.map((i) => ({
              id: i.id,
              version: i.version,
              generatorId: i.generatorId,
              label: i.label,
              ownerUserId: i.ownerUserId,
              ownerName: i.ownerName,
              dueOn: i.dueOn,
              done: i.doneAt !== null,
              doneByName: i.doneByName,
            })),
            workPlan: workPlan.map((t) => ({
              taskId: t.taskId,
              title: t.title,
              status: t.status,
            })),
            readinessUrl: siteUrl(POWER_READINESS_PATH),
            fuelCans: cans.map((c) => ({
              id: c.id,
              version: c.version,
              number: c.number,
              ownerUserId: c.ownerUserId,
              ownerName: c.ownerUserId ? c.ownerName : "Camp",
              sizeLitres: c.sizeLitres,
              material: c.material,
              travelsWithUserId: c.travelsWithUserId,
              note: c.note,
            })),
            fuelCansUrl: siteUrl(POWER_REFUELLING_PATH),
            // Version 0 is "no agreement yet": save_power_sharing makes one.
            sharing: sharing
              ? {
                  version: sharing.version,
                  ...Object.fromEntries(
                    SHARING_KEYS.map((k) => [k, sharing[k]]),
                  ),
                }
              : { version: 0 },
            sharingUrl: siteUrl(POWER_SHARING_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "save_power_load",
    {
      title: "Add or change a power load",
      description:
        "Adds a load to this year's list, or changes one: give `loadId` and the `expectedVersion` you read (get_power_plan) and only the fields that change; null clears one. A new load needs name, area, category, quantity, wattsEach, schedule (hoursPerDay for hours_per_day, windows for windows) and owner. Days are day numbers on site.",
      inputSchema: z.object({
        loadId: Id.optional(),
        expectedVersion: Version.optional(),
        name: z.string().min(1).max(80).optional(),
        area: z.string().min(1).max(60).optional(),
        category: z.enum(LOAD_CATEGORIES).optional(),
        quantity: z.number().int().min(1).max(500).optional(),
        wattsEach: z.number().positive().optional(),
        surgeWattsEach: z.number().positive().nullable().optional(),
        dutyPct: z.number().min(1).max(100).optional(),
        schedule: z.enum(LOAD_SCHEDULES).optional(),
        hoursPerDay: z.number().positive().max(24).nullable().optional(),
        windows: z
          .array(z.object({ fromHour: Hour, toHour: Hour }))
          .nullable()
          .optional(),
        fromDay: z.number().int().min(1).nullable().optional(),
        toDay: z.number().int().min(1).nullable().optional(),
        volts: z.number().positive().optional(),
        current: z.enum(CURRENT_KINDS).optional(),
        owner: z.enum(LOAD_OWNERS).optional(),
        neighbourCamp: z.string().max(80).nullable().optional(),
        inventoryItemId: Id.nullable().optional(),
        circuit: z.string().max(40).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_power_load",
        extra,
        // Which fields, never their values.
        argsForAudit: {
          loadId: args.loadId ?? null,
          expectedVersion: args.expectedVersion ?? null,
          fields: given(LOAD_KEYS, args),
        },
        handler: async ({ scope }) => {
          if (args.loadId === undefined) {
            const parsed = LoadInput.safeParse(fill(LOAD_KEYS, args, null));
            if (!parsed.success) {
              throw new ToolError(firstIssue(parsed.error, CHECK_LOAD));
            }
            const result = await addPowerLoad({
              ...parsed.data,
              actorId: scope.campUserId,
            });
            if (!result.ok) refused(result.error, POWER_LOADS_PATH);
            return {
              id: result.id,
              name: parsed.data.name,
              version: 1,
              url: siteUrl(POWER_LOADS_PATH),
            };
          }
          if (args.expectedVersion === undefined) {
            throw new ToolError(
              "Give the load's expectedVersion, as you read it.",
            );
          }
          const load = (await listPowerLoads()).find(
            (l) => l.id === args.loadId,
          );
          if (!load) throw new ToolError(LOAD_GONE);
          if (load.version !== args.expectedVersion) {
            throw new ToolError(LOAD_CHANGED);
          }
          const whole = fill(LOAD_KEYS, args, load);
          // Only a neighbour's load names a camp: a new owner drops it.
          if (args.owner && args.owner !== "neighbour" && !args.neighbourCamp) {
            whole.neighbourCamp = null;
          }
          const parsed = EditLoadInput.safeParse({
            ...whole,
            loadId: load.id,
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_LOAD));
          }
          const result = await updatePowerLoad({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_LOADS_PATH);
          return {
            id: load.id,
            name: parsed.data.name,
            version: args.expectedVersion + 1,
            url: siteUrl(POWER_LOADS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "plug_in_power_load",
    {
      title: "Plug a load in on the grid",
      description:
        "Plugs one of this year's loads in at a point on the grid plan (`nodeId`, from get_power_plan's grid), or takes it off the grid (`nodeId` null), as the grid page does.",
      inputSchema: z.object({ loadId: Id, nodeId: Id.nullable() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "plug_in_power_load",
        extra,
        argsForAudit: { loadId: args.loadId, nodeId: args.nodeId },
        handler: async ({ scope }) => {
          const result = await assignLoadToGridNode({
            loadId: args.loadId,
            nodeId: args.nodeId,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_GRID_PATH);
          return {
            loadId: args.loadId,
            nodeId: args.nodeId,
            url: siteUrl(POWER_GRID_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "save_generator",
    {
      title: "Add or change a generator",
      description:
        "Adds a generator to the camp's gear, or changes one in service: give `generatorId` and the `expectedVersion` you read (get_power_plan) and only the fields that change. A new one needs model, ratedKva, maxKva, tankLitres, runtime50Hours, runtime100Hours (hours a full tank lasts at half and full load), fuelType and owner.",
      inputSchema: z.object({
        generatorId: Id.optional(),
        expectedVersion: Version.optional(),
        model: z.string().min(1).max(80).optional(),
        ratedKva: z.number().positive().optional(),
        maxKva: z.number().positive().optional(),
        tankLitres: z.number().positive().optional(),
        runtime50Hours: z.number().positive().optional(),
        runtime100Hours: z.number().positive().optional(),
        fuelType: z.enum(FUEL_TYPES).optional(),
        owner: z.enum(GENERATOR_OWNERS).optional(),
        inventoryItemId: Id.nullable().optional(),
        noiseNote: z.string().max(200).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_generator",
        extra,
        argsForAudit: {
          generatorId: args.generatorId ?? null,
          expectedVersion: args.expectedVersion ?? null,
          fields: given(GENERATOR_KEYS, args),
        },
        handler: async ({ scope }) => {
          if (args.generatorId === undefined) {
            const parsed = GeneratorInput.safeParse(
              fill(GENERATOR_KEYS, args, null),
            );
            if (!parsed.success) {
              throw new ToolError(firstIssue(parsed.error, CHECK_GENERATOR));
            }
            const result = await addGenerator({
              ...parsed.data,
              actorId: scope.campUserId,
            });
            if (!result.ok) refused(result.error, POWER_FUEL_PATH);
            return {
              id: result.id,
              model: parsed.data.model,
              version: 1,
              url: siteUrl(POWER_FUEL_PATH),
            };
          }
          if (args.expectedVersion === undefined) {
            throw new ToolError(
              "Give the generator's expectedVersion, as you read it.",
            );
          }
          const generator = await getGenerator(args.generatorId);
          if (!generator || generator.archivedAt) {
            throw new ToolError(GENERATOR_GONE);
          }
          if (generator.version !== args.expectedVersion) {
            throw new ToolError(GENERATOR_CHANGED);
          }
          const parsed = EditGeneratorInput.safeParse({
            ...fill(GENERATOR_KEYS, args, generator),
            generatorId: generator.id,
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_GENERATOR));
          }
          const result = await updateGenerator({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_FUEL_PATH);
          return {
            id: generator.id,
            model: parsed.data.model,
            version: args.expectedVersion + 1,
            url: siteUrl(POWER_FUEL_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_power_plan",
    {
      title: "Change this year's power plan",
      description:
        "Changes this year's plan, as the load list and the fuel page do. Give the plan's `expectedVersion` (get_power_plan; 0 when none is saved) and only the fields that change: generatorId, secondGeneratorNote, runFromHour and runToHour (both null for 24 h), daysOnSite, firstPoweredDay (YYYY-MM-DD), powerFactor, lowLoadFactor, safetyMarginPct, canLitres, cansOwned.",
      inputSchema: z.object({
        expectedVersion: Version,
        generatorId: Id.nullable().optional(),
        secondGeneratorNote: z.string().max(200).nullable().optional(),
        runFromHour: Hour.nullable().optional(),
        runToHour: Hour.nullable().optional(),
        daysOnSite: z.number().int().min(1).optional(),
        firstPoweredDay: Day.nullable().optional(),
        powerFactor: z.number().optional(),
        lowLoadFactor: z.number().optional(),
        safetyMarginPct: z.number().optional(),
        canLitres: z.number().positive().optional(),
        cansOwned: z.number().int().min(0).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_power_plan",
        extra,
        argsForAudit: {
          expectedVersion: args.expectedVersion,
          fields: given(PLAN_KEYS, args),
        },
        handler: async ({ scope }) => {
          const fields = given(PLAN_KEYS, args);
          if (fields.length === 0) {
            throw new ToolError("Say what to change in the plan.");
          }
          const {
            cycle: _cycle,
            version,
            updatedAt: _u,
            ...current
          } = await getPowerPlan();
          // The rest of the plan is checked as it stands at this version.
          if (version !== args.expectedVersion)
            throw new ToolError(PLAN_CHANGED);
          const parsed = PowerPlanInput.safeParse({
            ...current,
            ...fill(PLAN_KEYS, args, null),
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_PLAN));
          }
          // Only the fields given: a setting saved meanwhile is not written
          // back (the version check above refuses that case anyway).
          const patch = Object.fromEntries(
            fields.map((k) => [k, parsed.data[k as keyof typeof parsed.data]]),
          );
          const result = await setPowerPlan({
            actorId: scope.campUserId,
            patch,
            expectedVersion: args.expectedVersion,
          });
          if (!result.ok) refused(result.error, POWER_FUEL_PATH);
          return {
            version: result.version,
            changed: fields,
            url: siteUrl(POWER_FUEL_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "copy_power_last_year",
    {
      title: "Copy last year's power plan",
      description:
        'Copies the most recent earlier year\'s `what` into this year: "loads" (the load list), "plan" (the plan\'s settings, without the date of day 1) or "grid" (the grid points, with no loads plugged in). Refused when this year already has its own.',
      inputSchema: z.object({ what: z.enum(["loads", "plan", "grid"]) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "copy_power_last_year",
        extra,
        argsForAudit: { what: args.what },
        handler: async ({ scope }) => {
          const actorId = scope.campUserId;
          if (args.what === "plan") {
            const result = await copyLastYearPlan({ actorId });
            if (!result.ok) refused(result.error, POWER_FUEL_PATH);
            return {
              copied: "plan",
              fromYear: result.fromCycle,
              url: siteUrl(POWER_FUEL_PATH),
            };
          }
          const path =
            args.what === "loads" ? POWER_LOADS_PATH : POWER_GRID_PATH;
          const result =
            args.what === "loads"
              ? await copyLastYearLoads({ actorId })
              : await copyLastYearGrid({ actorId });
          if (!result.ok) refused(result.error, path);
          return { copied: args.what, count: result.count, url: siteUrl(path) };
        },
      }),
  );

  server.registerTool(
    "save_grid_node",
    {
      title: "Add or change a grid point",
      description:
        "Adds a point to this year's grid plan, or changes one: give `nodeId` and the `expectedVersion` you read (get_power_plan) and only the fields that change. A new point needs name, kind and, unless it is the generator, `parentId` (the point that feeds it). Cable fields describe the run into it; haveCable and haveAdapter: true have it, false must get it, null not checked.",
      inputSchema: z.object({
        nodeId: Id.optional(),
        expectedVersion: Version.optional(),
        name: z.string().min(1).max(60).optional(),
        kind: z.enum(GRID_NODE_KINDS).optional(),
        parentId: Id.nullable().optional(),
        cable: z.string().max(80).nullable().optional(),
        cableLengthM: z.number().positive().nullable().optional(),
        cableGaugeMm2: z.number().positive().nullable().optional(),
        cableRatedAmps: z.number().positive().nullable().optional(),
        adapter: z.string().max(80).nullable().optional(),
        haveCable: z.boolean().nullable().optional(),
        haveAdapter: z.boolean().nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_grid_node",
        extra,
        argsForAudit: {
          nodeId: args.nodeId ?? null,
          expectedVersion: args.expectedVersion ?? null,
          fields: given(GRID_KEYS, args),
        },
        handler: async ({ scope }) => {
          if (args.nodeId === undefined) {
            const parsed = GridNodeInput.safeParse(fill(GRID_KEYS, args, null));
            if (!parsed.success) {
              throw new ToolError(firstIssue(parsed.error, CHECK_GRID));
            }
            const result = await addGridNode({
              ...parsed.data,
              actorId: scope.campUserId,
            });
            if (!result.ok) refused(result.error, POWER_GRID_PATH);
            return {
              id: result.id,
              name: parsed.data.name,
              version: 1,
              url: siteUrl(POWER_GRID_PATH),
            };
          }
          if (args.expectedVersion === undefined) {
            throw new ToolError(
              "Give the point's expectedVersion, as you read it.",
            );
          }
          const node = (await listGridNodes()).find(
            (n) => n.id === args.nodeId,
          );
          if (!node) throw new ToolError(GRID_NODE_GONE);
          if (node.version !== args.expectedVersion) {
            throw new ToolError(GRID_NODE_CHANGED);
          }
          const parsed = EditGridNodeInput.safeParse({
            ...fill(GRID_KEYS, args, node),
            nodeId: node.id,
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_GRID));
          }
          const result = await updateGridNode({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_GRID_PATH);
          return {
            id: node.id,
            name: parsed.data.name,
            version: args.expectedVersion + 1,
            url: siteUrl(POWER_GRID_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "start_readiness_checklist",
    {
      title: "Start a generator's checklist",
      description:
        "Starts this year's readiness checklist for a generator in service (`generatorId`), from the team's standard checks, as the readiness page's Start does. Once a year per generator.",
      inputSchema: z.object({ generatorId: Id }),
    },
    async (args, extra) =>
      runTool({
        toolName: "start_readiness_checklist",
        extra,
        argsForAudit: { generatorId: args.generatorId },
        handler: async ({ scope }) => {
          const result = await startReadinessChecklist({
            generatorId: args.generatorId,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_READINESS_PATH);
          return {
            generatorId: args.generatorId,
            count: result.count,
            url: siteUrl(POWER_READINESS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "save_readiness_item",
    {
      title: "Add or assign a readiness check",
      description:
        "Adds a check to a generator's readiness checklist (`generatorId` and `label`), or says who sees to a check and by when: give `itemId`, the `expectedVersion` you read (get_power_plan) and `ownerUserId` (an approved member, or null) and/or `dueOn` (YYYY-MM-DD, or null).",
      inputSchema: z.object({
        itemId: Id.optional(),
        expectedVersion: Version.optional(),
        generatorId: Id.optional(),
        label: z.string().min(1).max(80).optional(),
        ownerUserId: MemberId.nullable().optional(),
        dueOn: Day.nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_readiness_item",
        extra,
        argsForAudit: {
          itemId: args.itemId ?? null,
          generatorId: args.generatorId ?? null,
          expectedVersion: args.expectedVersion ?? null,
          fields: given(["label", "ownerUserId", "dueOn"], args),
        },
        handler: async ({ scope }) => {
          if (args.itemId === undefined) {
            const parsed = AddReadinessItemInput.safeParse({
              generatorId: args.generatorId,
              label: args.label,
            });
            if (!parsed.success) {
              throw new ToolError(firstIssue(parsed.error, CHECK_READINESS));
            }
            const result = await addReadinessItem({
              ...parsed.data,
              actorId: scope.campUserId,
            });
            if (!result.ok) refused(result.error, POWER_READINESS_PATH);
            return {
              id: result.id,
              label: parsed.data.label,
              version: 1,
              url: siteUrl(POWER_READINESS_PATH),
            };
          }
          if (args.label !== undefined || args.generatorId !== undefined) {
            throw new ToolError(
              "A check's words and generator stay as they are; give only ownerUserId or dueOn.",
            );
          }
          if (args.expectedVersion === undefined) {
            throw new ToolError(
              "Give the check's expectedVersion, as you read it.",
            );
          }
          const item = (await listReadinessItems()).find(
            (i) => i.id === args.itemId,
          );
          if (!item) throw new ToolError(READINESS_ITEM_GONE);
          if (item.version !== args.expectedVersion) {
            throw new ToolError(READINESS_ITEM_CHANGED);
          }
          const parsed = EditReadinessItemInput.safeParse({
            itemId: item.id,
            expectedVersion: args.expectedVersion,
            ...fill(["ownerUserId", "dueOn"] as const, args, item),
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_READINESS));
          }
          const result = await updateReadinessItem({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_READINESS_PATH);
          return {
            id: item.id,
            label: item.label,
            version: args.expectedVersion + 1,
            url: siteUrl(POWER_READINESS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "tick_readiness_item",
    {
      title: "Tick a readiness check",
      description:
        "Ticks a check on a generator's readiness checklist done (`done` true), or not done (false), as the readiness page does. Refused if someone ticked it that way first.",
      inputSchema: z.object({ itemId: Id, done: z.boolean() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "tick_readiness_item",
        extra,
        argsForAudit: { itemId: args.itemId, done: args.done },
        handler: async ({ scope }) => {
          const result = await tickReadinessItem({
            itemId: args.itemId,
            done: args.done,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_READINESS_PATH);
          return {
            itemId: args.itemId,
            done: args.done,
            url: siteUrl(POWER_READINESS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "add_power_work_plan",
    {
      title: "Put the power work plan on the board",
      description:
        "Puts this year's Power & Lighting work plan on the task board as the team's tasks, with nobody on them yet: last year's plan as the team left it, or the standard one. Once a year.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "add_power_work_plan",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const result = await addWorkPlanToBoard({
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_READINESS_PATH);
          return {
            count: result.count,
            fromYear: result.fromCycle,
            url: siteUrl("/tasks"),
          };
        },
      }),
  );

  server.registerTool(
    "save_power_sharing",
    {
      title: "Save the power sharing agreement",
      description:
        'Saves this year\'s agreement to share a generator with a neighbouring camp. Give the `expectedVersion` you read (get_power_plan\'s sharing; 0 when there is none) and only the fields that change. A new one needs partnerCamp and generatorSource ("ours" with generatorId, or "theirs"). contactRole and watchCover name roles, never phone numbers or emails.',
      inputSchema: z.object({
        expectedVersion: Version,
        partnerCamp: z.string().min(1).max(80).optional(),
        contactRole: z.string().max(60).nullable().optional(),
        generatorSource: z.enum(SHARE_GENERATOR_SOURCES).optional(),
        generatorId: Id.nullable().optional(),
        theirGenerator: z.string().max(80).nullable().optional(),
        partnerFuelPct: z.number().min(0).max(100).nullable().optional(),
        watchCover: z.string().max(300).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_power_sharing",
        extra,
        argsForAudit: {
          expectedVersion: args.expectedVersion,
          fields: given(SHARING_KEYS, args),
        },
        handler: async ({ scope }) => {
          const current = await getSharingAgreement();
          if ((current?.version ?? 0) !== args.expectedVersion) {
            throw new ToolError(SHARING_CHANGED);
          }
          const parsed = SharingAgreementInput.safeParse({
            ...fill(SHARING_KEYS, args, current),
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_SHARING));
          }
          const result = await saveSharingAgreement({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_SHARING_PATH);
          return {
            partnerCamp: parsed.data.partnerCamp,
            version: result.version,
            url: siteUrl(POWER_SHARING_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "save_fuel_can",
    {
      title: "Add or change a fuel can",
      description:
        "Adds a fuel can to this year's list (the printed can sheet), or changes one: give `canId` and the `expectedVersion` you read (get_power_plan) and only the fields that change. sizeLitres and material (metal or plastic) are needed; ownerUserId is the member who owns it (null: the camp's); travelsWithUserId is the driver whose car brings it (list_drivers), or null.",
      inputSchema: z.object({
        canId: Id.optional(),
        expectedVersion: Version.optional(),
        ownerUserId: MemberId.nullable().optional(),
        sizeLitres: z.number().positive().optional(),
        material: z.enum(CAN_MATERIALS).optional(),
        travelsWithUserId: MemberId.nullable().optional(),
        note: z.string().max(80).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_fuel_can",
        extra,
        argsForAudit: {
          canId: args.canId ?? null,
          expectedVersion: args.expectedVersion ?? null,
          fields: given(CAN_KEYS, args),
        },
        handler: async ({ scope }) => {
          if (args.canId === undefined) {
            const parsed = FuelCanInput.safeParse({
              ownerUserId: null,
              travelsWithUserId: null,
              ...fill(CAN_KEYS, args, null),
            });
            if (!parsed.success) {
              throw new ToolError(firstIssue(parsed.error, CHECK_CANS));
            }
            const result = await addFuelCan({
              ...parsed.data,
              actorId: scope.campUserId,
            });
            if (!result.ok) refused(result.error, POWER_REFUELLING_PATH);
            return {
              id: result.id,
              number: result.number,
              version: 1,
              url: siteUrl(POWER_REFUELLING_PATH),
            };
          }
          if (args.expectedVersion === undefined) {
            throw new ToolError(
              "Give the can's expectedVersion, as you read it.",
            );
          }
          const can = (await fuelCansNumbered()).find(
            (c) => c.id === args.canId,
          );
          if (!can) throw new ToolError(CAN_GONE);
          if (can.version !== args.expectedVersion) {
            throw new ToolError(CAN_CHANGED);
          }
          if (can.material === null && args.material === undefined) {
            throw new ToolError(
              "Say what the can is made of: metal or plastic.",
            );
          }
          const parsed = EditFuelCanInput.safeParse({
            ...fill(CAN_KEYS, args, can),
            canId: can.id,
            expectedVersion: args.expectedVersion,
          });
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_CANS));
          }
          const result = await updateFuelCan({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) refused(result.error, POWER_REFUELLING_PATH);
          return {
            id: can.id,
            number: can.number,
            version: args.expectedVersion + 1,
            url: siteUrl(POWER_REFUELLING_PATH),
          };
        },
      }),
  );
}
