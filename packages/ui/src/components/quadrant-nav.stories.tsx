import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuadrantNav } from "./quadrant-nav";

const meta = {
  title: "Control Panel/QuadrantNav",
  component: QuadrantNav,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof QuadrantNav>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The v0 single-layer home navigation with a push-to-talk centre button.
 * Superseded by `ControlPanel` for layered navigation — kept for reference.
 */
export const Default: Story = {
  args: {
    topLeft: { label: "Members", href: "#members" },
    topRight: { label: "Meals", href: "#meals" },
    bottomLeft: { label: "Reimbursements", href: "#reimbursements" },
    bottomRight: { label: "Manuals", href: "#manuals" },
    centre: { label: "Hold to talk" },
  },
};
