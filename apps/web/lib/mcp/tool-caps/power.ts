import { POWER_EDITOR } from "@camp404/core";
import {
  POWER_FUEL_PATH,
  POWER_GRID_PATH,
  POWER_HOME_PATH,
  POWER_LOADS_PATH,
  POWER_READINESS_PATH,
  POWER_REFUELLING_PATH,
  POWER_REFUSAL,
  POWER_SHARING_PATH,
} from "../../power-copy";
import { byRule, GATES, type Gate, type ToolCapability } from "../gates";

// The Power program (#253–#257) over the connector. Every approved member
// reads it (the Power program's own gate, PowerFrame's powerViewer at
// camp_member); every save is POWER_EDITOR, the rule each Power action asks at
// its door (powerGate) and each db write asks again on the locked actor.

/** A captain or a lead of Power & Lighting this year (POWER_EDITOR). */
export const POWER_EDITOR_GATE: Gate = {
  who: "Captains and Power & Lighting leads",
  allows: byRule(POWER_EDITOR),
  refusal: POWER_REFUSAL,
};

const write = (does: string, page: string): ToolCapability => ({
  kind: "write",
  area: "Power",
  gate: POWER_EDITOR_GATE,
  does,
  page,
});

export const POWER_CAPABILITIES: Readonly<Record<string, ToolCapability>> = {
  get_power_plan: {
    kind: "read",
    area: "Power",
    gate: GATES.member,
    does: "This year's power plan as the Power pages show it: loads, generators, the plan's settings, the grid, readiness checklists, fuel cans and the sharing agreement, with ids and versions.",
    page: POWER_HOME_PATH,
  },
  save_power_load: write(
    "Add a load to this year's list, or change one.",
    POWER_LOADS_PATH,
  ),
  plug_in_power_load: write(
    "Plug a load in at a point on the grid, or take it off the grid.",
    POWER_GRID_PATH,
  ),
  save_generator: write(
    "Add a generator to the camp's gear, or change one.",
    POWER_FUEL_PATH,
  ),
  set_power_plan: write(
    "Change this year's plan: the generator, its hours, days on site, the power factor and the fuel margins.",
    POWER_FUEL_PATH,
  ),
  copy_power_last_year: write(
    "Copy last year's loads, plan or grid into this year, when this year has none.",
    POWER_HOME_PATH,
  ),
  save_grid_node: write(
    "Add a point to this year's grid plan, or change one.",
    POWER_GRID_PATH,
  ),
  start_readiness_checklist: write(
    "Start a generator's readiness checklist for this year.",
    POWER_READINESS_PATH,
  ),
  save_readiness_item: write(
    "Add a check to a generator's readiness checklist, or say who sees to one and by when.",
    POWER_READINESS_PATH,
  ),
  tick_readiness_item: write(
    "Tick a readiness check done, or not done.",
    POWER_READINESS_PATH,
  ),
  add_power_work_plan: write(
    "Put this year's Power & Lighting work plan on the task board, once a year.",
    POWER_READINESS_PATH,
  ),
  save_power_sharing: write(
    "Save this year's agreement to share a generator with a neighbouring camp.",
    POWER_SHARING_PATH,
  ),
  save_fuel_can: write(
    "Add a fuel can to this year's list, or change one.",
    POWER_REFUELLING_PATH,
  ),
};
