import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ClipboardList,
  GripVertical,
  Shield,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { GridTile } from "./grid-tile";

const meta = {
  title: "Components/GridTile",
  component: GridTile,
  parameters: { layout: "centered" },
  args: { icon: Users, title: "My Teams", hint: "Your crews" },
} satisfies Meta<typeof GridTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBadge: Story = {
  args: {
    icon: ClipboardList,
    title: "Camp Tasks",
    hint: "Camp-wide work board",
    badge: 12,
  },
};

export const LinkMode: Story = {
  args: {
    icon: Shield,
    title: "Camp Management",
    hint: "Roster & statuses",
    href: "/captains/camp-management",
  },
};

export const AccentTone: Story = {
  args: {
    icon: UserCog,
    title: "Crew Roster",
    hint: "Your crew's statuses",
    iconTone: "accent",
  },
};

export const SecondaryTone: Story = {
  args: { iconTone: "secondary" },
};

export const Locked: Story = {
  args: {
    icon: Shield,
    title: "Camp Management",
    hint: "Roster & statuses",
    disabled: true,
  },
};

export const WithDragHandle: Story = {
  args: {
    icon: ClipboardList,
    title: "Camp Tasks",
    dragHandle: <GripVertical className="h-4 w-4 text-muted-foreground" />,
  },
};

export const AllTones: Story = {
  render: () => (
    <div className="grid w-96 grid-cols-2 gap-3">
      <GridTile icon={Shield} title="Captain" hint="primary" iconTone="primary" />
      <GridTile
        icon={UserCog}
        title="Team Lead"
        hint="accent"
        iconTone="accent"
      />
      <GridTile
        icon={Users}
        title="Team Member"
        hint="secondary"
        iconTone="secondary"
      />
      <GridTile icon={Wrench} title="Tools" hint="Meals, expenses…" />
    </div>
  ),
};
