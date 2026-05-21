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
import {
  ControlPanel,
  ControlPanelHeader,
  type ControlPanelLayer,
} from "./control-panel";

/**
 * Three stacked layers — camp member, team lead, captain. Tap the centre
 * circle to cycle through them. The two undecided personal quadrants
 * (top-right, bottom-left) are intentionally left as placeholders.
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
  title: "Control Panel/ControlPanel",
  component: ControlPanel,
  parameters: { layout: "fullscreen" },
  argTypes: {
    viewerRank: {
      control: "inline-radio",
      options: ["camp_member", "team_lead", "captain"],
    },
    initialLayer: {
      control: { type: "number", min: 0, max: 2 },
    },
  },
  args: {
    layers,
    header: <ControlPanelHeader userName="Ash" />,
  },
} satisfies Meta<typeof ControlPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A camp member: layer one is theirs; team lead and captain are view-only. */
export const CampMember: Story = {
  args: { viewerRank: "camp_member", initialLayer: 0 },
};

/** A team lead: their layer unlocks too; captain stays view-only. */
export const TeamLead: Story = {
  args: { viewerRank: "team_lead", initialLayer: 1 },
};

/** A captain: every layer is unlocked. */
export const Captain: Story = {
  args: { viewerRank: "captain", initialLayer: 2 },
};

/**
 * What a camp member sees after cycling up to the captain layer — the UI is
 * fully browsable, but the tiles are locked and carry no data.
 */
export const LockedLayer: Story = {
  args: { viewerRank: "camp_member", initialLayer: 2 },
};
