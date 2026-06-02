import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider } from "./divider";

const meta = {
  title: "Components/Divider",
  component: Divider,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Divider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64">
      <p className="text-sm">Above</p>
      <Divider className="my-3" />
      <p className="text-sm">Below</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-3">
      <span className="text-sm">A</span>
      <Divider orientation="vertical" />
      <span className="text-sm">B</span>
    </div>
  ),
};
