import {
  ClipboardList,
  FileText,
  ListChecks,
  Megaphone,
  Shield,
  User,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ViewerRank } from "@camp404/types";
import type { IconBadgeTone } from "@camp404/ui/components/icon-badge";

/**
 * The static home control-panel catalogue (board S08): three rank groups,
 * captain-first, four tools each. The page gates each group server-side with
 * `requireClearance` and withholds the tiles of locked groups, so this is the
 * single source of truth for what a *cleared* viewer sees.
 *
 * Only four destinations exist today; the rest are `comingSoon` — rendered
 * inert with no href so they never 404 (the old quadrant model wired dead
 * `/members` / `/meals` links). Per-tile badge counts are deferred: their
 * destinations (tasks / team_memberships reads) aren't built, so no fabricated
 * numbers ship — the count slot lights up once those reads land.
 */
export interface CatalogueTile {
  id: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  /** Live destination, or null for a not-yet-built tool. */
  href: string | null;
  comingSoon: boolean;
}

export interface RankGroupSpec {
  id: string;
  /** Clearance bar for the group, on the viewer ladder. */
  rank: ViewerRank;
  name: string;
  groupIcon: LucideIcon;
  /** GroupHead chip + per-tile icon-box tone. */
  chipTone: IconBadgeTone;
  tiles: CatalogueTile[];
}

export const TILE_CATALOGUE: RankGroupSpec[] = [
  {
    id: "captain",
    rank: "captain",
    name: "Captain",
    groupIcon: Shield,
    chipTone: "primary",
    tiles: [
      {
        id: "camp-management",
        icon: Shield,
        title: "Camp Management",
        hint: "Roster & statuses",
        href: "/captains/camp-management",
        comingSoon: false,
      },
      {
        id: "camp-tasks",
        icon: ClipboardList,
        title: "Camp Tasks",
        hint: "Camp-wide work board",
        href: null,
        comingSoon: true,
      },
      {
        id: "finances",
        icon: Wallet,
        title: "Finances",
        hint: "Dues & reimbursements",
        href: null,
        comingSoon: true,
      },
      {
        id: "camp-tools",
        icon: Megaphone,
        title: "Camp Tools",
        hint: "Announcements, admin…",
        href: "/captains/tools",
        comingSoon: false,
      },
    ],
  },
  {
    id: "team-lead",
    rank: "team_lead",
    name: "Team Lead",
    groupIcon: UserCog,
    chipTone: "accent",
    tiles: [
      {
        id: "crew-roster",
        icon: Users,
        title: "Crew Roster",
        hint: "Your crew's statuses",
        href: null,
        comingSoon: true,
      },
      {
        id: "crew-tasks",
        icon: ClipboardList,
        title: "Crew Tasks",
        hint: "Assign & track work",
        href: null,
        comingSoon: true,
      },
      {
        id: "crew-forms",
        icon: FileText,
        title: "Crew Forms",
        hint: "Questionnaire responses",
        href: null,
        comingSoon: true,
      },
      {
        id: "crew-announcements",
        icon: Megaphone,
        title: "Crew Announcements",
        hint: "Post to your crew",
        href: null,
        comingSoon: true,
      },
    ],
  },
  {
    id: "team-member",
    rank: "camp_member",
    name: "Team Member",
    groupIcon: User,
    chipTone: "secondary",
    tiles: [
      {
        id: "my-teams",
        icon: Users,
        title: "My Teams",
        hint: "Your crews",
        href: null,
        comingSoon: true,
      },
      {
        id: "my-tasks",
        icon: ListChecks,
        title: "My Tasks",
        hint: "What's on you",
        href: null,
        comingSoon: true,
      },
      {
        id: "my-profile",
        icon: UserRound,
        title: "My Profile",
        hint: "You & your data",
        href: "/profile",
        comingSoon: false,
      },
      {
        id: "tools",
        icon: Wrench,
        title: "Tools",
        hint: "Meals, expenses…",
        href: "/tools",
        comingSoon: false,
      },
    ],
  },
];
