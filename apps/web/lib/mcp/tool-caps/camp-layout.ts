import { LAYOUT_EDITOR } from "@camp404/core";
import { LAYOUT_REFUSAL } from "../../camp-layout-copy";
import { byRule, GATES, type Gate, type ToolCapability } from "../gates";

// The camp layout (#271). Every member reads the plan; a captain or a
// Structures lead saves it (LAYOUT_EDITOR, the actions' ruleActionGate, read
// again inside the write). Sharing it with neighbours puts it on a public
// page, so that stays on the website.

export const LAYOUT_EDITOR_GATE: Gate = {
  who: "Captains and Structures leads",
  allows: byRule(LAYOUT_EDITOR),
  refusal: LAYOUT_REFUSAL,
};

const PAGE = "/camp-layout";

export const CAMP_LAYOUT_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_camp_layout: {
    kind: "read",
    area: "Camp layout",
    gate: GATES.member,
    does: "This year's site plan with its version, and the saved versions.",
    page: PAGE,
  },
  save_camp_layout: {
    kind: "write",
    area: "Camp layout",
    gate: LAYOUT_EDITOR_GATE,
    does: "Save the whole site plan as a new version.",
    page: PAGE,
  },
  restore_camp_layout_version: {
    kind: "write",
    area: "Camp layout",
    gate: LAYOUT_EDITOR_GATE,
    does: "Save an earlier version of this year's plan again, as the newest.",
    page: PAGE,
  },
  copy_last_year_layout: {
    kind: "write",
    area: "Camp layout",
    gate: LAYOUT_EDITOR_GATE,
    does: "Start this year's plan from the last year that had one.",
    page: PAGE,
  },
};
