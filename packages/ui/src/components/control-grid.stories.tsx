import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CalendarClock,
  CircleDashed,
  ClipboardList,
  FileText,
  ListChecks,
  Megaphone,
  Users,
  UserRound,
  Wallet,
} from "lucide-react";
import { ControlGrid } from "./control-grid";
import { ControlPanelHeader, type ControlPanelLayer } from "./control-panel";

/**
 * Same three rank layers as the mobile control panel — camp member, team
 * lead, captain. On desktop every layer is laid out at once as its own
 * section; sections above the viewer's rank render as dotted-out, inactive
 * tiles. The two undecided personal quadrants (top-right, bottom-left of the
 * member layer) are intentionally left as placeholders.
 */
const layers: ControlPanelLayer[] = [
  {
    rank: "camp_member",
    topLeft: {
      label: "My Profile",
      hint: "Identity, dietary, emergency contacts",
      icon: <UserRound className="h-5 w-5" />,
    },
    topRight: {
      label: "Coming soon",
      hint: "Quadrant to be decided",
      icon: <CircleDashed className="h-5 w-5" />,
    },
    bottomLeft: {
      label: "Coming soon",
      hint: "Quadrant to be decided",
      icon: <CircleDashed className="h-5 w-5" />,
    },
    bottomRight: {
      label: "My Tasks",
      hint: "What the camp needs from you",
      icon: <ListChecks className="h-5 w-5" />,
    },
  },
  {
    rank: "team_lead",
    topLeft: {
      label: "Team Roster",
      hint: "Members in your team group",
      icon: <Users className="h-5 w-5" />,
    },
    topRight: {
      label: "Shift Planning",
      hint: "Schedule your team's shifts",
      icon: <CalendarClock className="h-5 w-5" />,
    },
    bottomLeft: {
      label: "Team Notices",
      hint: "Broadcast to your team",
      icon: <Megaphone className="h-5 w-5" />,
    },
    bottomRight: {
      label: "Team Tasks",
      hint: "Assign and track team work",
      icon: <ClipboardList className="h-5 w-5" />,
    },
  },
  {
    rank: "captain",
    topLeft: {
      label: "Camp Roster",
      hint: "Every camp member",
      icon: <Users className="h-5 w-5" />,
    },
    topRight: {
      label: "Registrations",
      hint: "Afrikaburn paperwork & passports",
      icon: <FileText className="h-5 w-5" />,
    },
    bottomLeft: {
      label: "Finances",
      hint: "Dues and reimbursements",
      icon: <Wallet className="h-5 w-5" />,
    },
    bottomRight: {
      label: "Camp Tasks",
      hint: "Camp-wide work board",
      icon: <ClipboardList className="h-5 w-5" />,
    },
  },
];

const meta = {
  title: "Control Panel/ControlGrid",
  component: ControlGrid,
  parameters: { layout: "fullscreen" },
  argTypes: {
    viewerRank: {
      control: "inline-radio",
      options: ["camp_member", "team_lead", "captain"],
    },
  },
  args: {
    layers,
    header: <ControlPanelHeader userName="Ash" />,
  },
} satisfies Meta<typeof ControlGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A camp member: their section is active; team lead and captain are dotted-out. */
export const CampMember: Story = {
  args: { viewerRank: "camp_member" },
};

/** A team lead: their section unlocks too; captain stays inactive. */
export const TeamLead: Story = {
  args: { viewerRank: "team_lead" },
};

/** A captain: every section is active. */
export const Captain: Story = {
  args: { viewerRank: "captain" },
};
