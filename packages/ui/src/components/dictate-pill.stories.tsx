import type { Meta, StoryObj } from "@storybook/react-vite";
import { DictatePill } from "./dictate-pill";

const meta = {
  title: "Components/DictatePill",
  component: DictatePill,
  parameters: { layout: "centered" },
  args: { onActivate: () => {} },
} satisfies Meta<typeof DictatePill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomLabel: Story = {
  args: { label: "Start dictating" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

// Tab to the pill and press Enter/Space — it's a native <button>, so keyboard
// activation works without JS overrides. Visual + a11y-addon verification.
export const KeyboardActivate: Story = {};

export const ClickFires: Story = {
  args: { onActivate: () => console.log("DictatePill activated") },
};
