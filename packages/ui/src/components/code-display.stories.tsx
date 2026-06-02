import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeDisplay } from "./code-display";

const meta = {
  title: "Components/CodeDisplay",
  component: CodeDisplay,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CodeDisplay>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { code: "neon-toaster-mongoose" },
};
