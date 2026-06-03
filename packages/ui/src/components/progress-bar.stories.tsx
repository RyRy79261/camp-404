import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressBar } from "./progress-bar";

const meta = {
  title: "Components/ProgressBar",
  component: ProgressBar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProgressBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Steps: Story = {
  args: { value: 0 },
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <ProgressBar value={0} label="Onboarding progress" />
      <ProgressBar value={6} max={13} label="Onboarding progress" />
      <ProgressBar value={13} max={13} label="Onboarding progress" />
    </div>
  ),
};
