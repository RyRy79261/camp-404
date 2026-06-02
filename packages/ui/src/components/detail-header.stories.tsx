import type { Meta, StoryObj } from "@storybook/react-vite";
import { User } from "lucide-react";
import { Button } from "./button";
import { IconBadge } from "./icon-badge";
import { DetailHeader } from "./detail-header";

const meta = {
  title: "Components/DetailHeader",
  component: DetailHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DetailHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Dusty Boot",
    subtitle: "Member · joined 12 Jan",
    leading: (
      <IconBadge>
        <User />
      </IconBadge>
    ),
    action: (
      <Button size="sm" variant="outline">
        Assign captain
      </Button>
    ),
  },
  render: (args) => (
    <div className="w-[28rem]">
      <DetailHeader {...args} />
    </div>
  ),
};
