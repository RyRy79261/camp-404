import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = {
  title: "Components/Badge",
  component: Badge,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Captain</Badge>
      <Badge variant="secondary">Member</Badge>
      <Badge variant="outline">Team Lead</Badge>
      <Badge variant="success">Approved</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="destructive">Rejected</Badge>
    </div>
  ),
};
