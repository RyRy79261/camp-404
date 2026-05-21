import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "./slider";

const meta = {
  title: "Components/Slider",
  component: Slider,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Slider
      className="w-64"
      defaultValue={[40]}
      min={0}
      max={100}
      step={1}
    />
  ),
};

export const Range: Story = {
  render: () => (
    <Slider
      className="w-64"
      defaultValue={[25, 75]}
      min={0}
      max={100}
      step={5}
    />
  ),
};
