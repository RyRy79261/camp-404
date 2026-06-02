import type { Meta, StoryObj } from "@storybook/react-vite";
import { Spinner } from "./spinner";

const meta = {
  title: "Components/Spinner",
  component: Spinner,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner size="sm" />
      <Spinner />
      <Spinner size="lg" />
    </div>
  ),
};
