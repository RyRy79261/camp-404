import type { Meta, StoryObj } from "@storybook/react-vite";
import { Megaphone } from "lucide-react";
import { NavCard } from "./nav-card";

const meta = {
  title: "Components/NavCard",
  component: NavCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof NavCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: "#",
    icon: <Megaphone />,
    title: "Announcements & notifications",
    description: "Compose a camp-wide announcement and publish it to everyone.",
  },
  render: (args) => (
    <div className="w-[28rem]">
      <NavCard {...args} />
    </div>
  ),
};
