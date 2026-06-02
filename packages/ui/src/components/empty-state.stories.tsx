import type { Meta, StoryObj } from "@storybook/react-vite";
import { Users } from "lucide-react";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Components/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <Users className="h-5 w-5" />,
    title: "No members yet",
    description:
      "Nobody has signed up for camp. Invite codes are how people get in.",
  },
};
