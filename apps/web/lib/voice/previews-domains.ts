import type { PreviewFn } from "./preview-kit";
import { POWER_PREVIEWS } from "./previews-power";
import { LOUNGE_PREVIEWS } from "./previews-lounge";
import { HELP_WANTED_PREVIEWS } from "./previews-help-wanted";
import { PETS_PREVIEWS } from "./previews-pets";
import { CAMP_LAYOUT_PREVIEWS } from "./previews-camp-layout";
import { KITCHEN_PLAN_PREVIEWS } from "./previews-kitchen-plan";
import { INVENTORY_MORE_PREVIEWS } from "./previews-inventory-more";
import { LOGISTICS_MORE_PREVIEWS } from "./previews-logistics-more";
import { GEAR_RENTAL_PREVIEWS } from "./previews-gear-rental";
import { TASKS_MORE_PREVIEWS } from "./previews-tasks-more";
import { MEETINGS_MORE_PREVIEWS } from "./previews-meetings-more";
import { SHIFTS_MORE_PREVIEWS } from "./previews-shifts-more";
import { TRANSPORT_MORE_PREVIEWS } from "./previews-transport-more";
import { QUESTIONNAIRES_MORE_PREVIEWS } from "./previews-questionnaires-more";
import { GUIDE_MORE_PREVIEWS } from "./previews-guide-more";
import { PROFILE_MORE_PREVIEWS } from "./previews-profile-more";
import { CAPTAIN_PEOPLE_PREVIEWS } from "./previews-captain-people";
import { ANNOUNCEMENTS_PREVIEWS } from "./previews-announcements";
import { JOIN_SITE_PREVIEWS } from "./previews-join-site";

// Each domain's voice previews, one file per domain (previews-<domain>.ts),
// merged into PREVIEWS (./previews).

export const DOMAIN_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  ...POWER_PREVIEWS,
  ...LOUNGE_PREVIEWS,
  ...HELP_WANTED_PREVIEWS,
  ...PETS_PREVIEWS,
  ...CAMP_LAYOUT_PREVIEWS,
  ...KITCHEN_PLAN_PREVIEWS,
  ...INVENTORY_MORE_PREVIEWS,
  ...LOGISTICS_MORE_PREVIEWS,
  ...GEAR_RENTAL_PREVIEWS,
  ...TASKS_MORE_PREVIEWS,
  ...MEETINGS_MORE_PREVIEWS,
  ...SHIFTS_MORE_PREVIEWS,
  ...TRANSPORT_MORE_PREVIEWS,
  ...QUESTIONNAIRES_MORE_PREVIEWS,
  ...GUIDE_MORE_PREVIEWS,
  ...PROFILE_MORE_PREVIEWS,
  ...CAPTAIN_PEOPLE_PREVIEWS,
  ...ANNOUNCEMENTS_PREVIEWS,
  ...JOIN_SITE_PREVIEWS,
};
