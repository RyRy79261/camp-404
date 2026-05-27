import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Bell,
  CalendarClock,
  ClipboardList,
  FileText,
  ListChecks,
  Megaphone,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  ControlPanel,
  type ControlPanelLayer,
} from "./control-panel";

/**
 * Three stacked layers — camp member, team lead, captain. The bottom tab bar
 * switches between them; the centre circle is push-to-talk.
 */
const layers: ControlPanelLayer[] = [
  {
    rank: "camp_member",
    topLeft: {
      label: "My Teams",
      hint: "Your crews",
      href: "#teams",
      icon: <Users className="h-5 w-5" />,
    },
    topRight: {
      label: "My Tasks",
      hint: "What's on you",
      href: "#tasks",
      icon: <ListChecks className="h-5 w-5" />,
      badge: 3,
    },
    bottomLeft: {
      label: "My Profile",
      hint: "You & your data",
      href: "#profile",
      icon: <UserRound className="h-5 w-5" />,
    },
    bottomRight: {
      label: "Tools",
      hint: "Meals, expenses…",
      href: "#tools",
      icon: <Wrench className="h-5 w-5" />,
      badge: 2,
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

function DemoHeader() {
  return (
    <>
      <button
        type="button"
        aria-label="Notifications (4 unread)"
        className="relative rounded-full p-1.5 text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-muted)]"
      >
        <Bell className="h-5 w-5" aria-hidden />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-primary)] px-1 text-[10px] font-semibold text-[color:var(--color-primary-foreground)]">
          4
        </span>
      </button>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-secondary)] text-xs font-semibold text-[color:var(--color-secondary-foreground)]">
        RK
      </span>
    </>
  );
}

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
    header: <DemoHeader />,
    centre: { label: "TALK" },
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
 * What a camp member sees after tapping up to the captain tab — the UI is
 * fully browsable, but the tiles are locked and carry no data.
 */
export const LockedLayer: Story = {
  args: { viewerRank: "camp_member", initialLayer: 2 },
};
