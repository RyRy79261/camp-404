import type { Meta, StoryObj } from "@storybook/react-vite";
import { CaptainLock } from "./captain-lock";

const meta = {
  title: "Components/CaptainLock",
  component: CaptainLock,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CaptainLock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-80">
      <CaptainLock />
    </div>
  ),
};

export const CustomCopy: Story = {
  render: () => (
    <div className="w-80">
      <CaptainLock title="LOCKED" message="Captains only." />
    </div>
  ),
};
