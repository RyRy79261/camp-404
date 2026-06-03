import type { Meta, StoryObj } from "@storybook/react-vite";
import { GhostBack } from "./ghost-back";

const meta = {
  title: "Components/GhostBack",
  component: GhostBack,
  parameters: { layout: "padded" },
} satisfies Meta<typeof GhostBack>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { href: "#", children: "Captains" },
};
