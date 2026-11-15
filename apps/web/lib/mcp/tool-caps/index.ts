import type { ToolCapability } from "../gates";
import { POWER_CAPABILITIES } from "./power";
import { LOUNGE_CAPABILITIES } from "./lounge";
import { HELP_WANTED_CAPABILITIES } from "./help-wanted";
import { PETS_CAPABILITIES } from "./pets";
import { CAMP_LAYOUT_CAPABILITIES } from "./camp-layout";
import { KITCHEN_PLAN_CAPABILITIES } from "./kitchen-plan";
import { INVENTORY_MORE_CAPABILITIES } from "./inventory-more";
import { LOGISTICS_MORE_CAPABILITIES } from "./logistics-more";
import { GEAR_RENTAL_CAPABILITIES } from "./gear-rental";
import { TASKS_MORE_CAPABILITIES } from "./tasks-more";
import { MEETINGS_MORE_CAPABILITIES } from "./meetings-more";
import { SHIFTS_MORE_CAPABILITIES } from "./shifts-more";
import { TRANSPORT_MORE_CAPABILITIES } from "./transport-more";
import { QUESTIONNAIRES_MORE_CAPABILITIES } from "./questionnaires-more";
import { GUIDE_MORE_CAPABILITIES } from "./guide-more";
import { PROFILE_MORE_CAPABILITIES } from "./profile-more";
import { CAPTAIN_PEOPLE_CAPABILITIES } from "./captain-people";
import { ANNOUNCEMENTS_CAPABILITIES } from "./announcements";
import { JOIN_SITE_CAPABILITIES } from "./join-site";

// Each domain's connector tools, one table per file, merged into
// TOOL_CAPABILITIES (../capabilities). A file here imports its gates from
// ../gates, never from ../capabilities, so there is no import cycle.

export const DOMAIN_CAPABILITIES: Readonly<Record<string, ToolCapability>> = {
  ...POWER_CAPABILITIES,
  ...LOUNGE_CAPABILITIES,
  ...HELP_WANTED_CAPABILITIES,
  ...PETS_CAPABILITIES,
  ...CAMP_LAYOUT_CAPABILITIES,
  ...KITCHEN_PLAN_CAPABILITIES,
  ...INVENTORY_MORE_CAPABILITIES,
  ...LOGISTICS_MORE_CAPABILITIES,
  ...GEAR_RENTAL_CAPABILITIES,
  ...TASKS_MORE_CAPABILITIES,
  ...MEETINGS_MORE_CAPABILITIES,
  ...SHIFTS_MORE_CAPABILITIES,
  ...TRANSPORT_MORE_CAPABILITIES,
  ...QUESTIONNAIRES_MORE_CAPABILITIES,
  ...GUIDE_MORE_CAPABILITIES,
  ...PROFILE_MORE_CAPABILITIES,
  ...CAPTAIN_PEOPLE_CAPABILITIES,
  ...ANNOUNCEMENTS_CAPABILITIES,
  ...JOIN_SITE_CAPABILITIES,
};
