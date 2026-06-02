import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatTile } from "./stat-tile";

const meta = {
  title: "Components/StatTile",
  component: StatTile,
  parameters: { layout: "padded" },
} satisfies Meta<typeof StatTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Strip: Story = {
  args: { label: "Members", value: 42 },
  render: (args) => (
    <div className="grid w-[28rem] grid-cols-3 gap-3">
      <StatTile {...args} />
      <StatTile label="Approved" value={31} hint="74%" />
      <StatTile label="Incomplete" value={6} />
    </div>
  ),
};
