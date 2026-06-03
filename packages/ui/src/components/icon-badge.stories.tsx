import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShieldCheck } from "lucide-react";
import { IconBadge } from "./icon-badge";

const meta = {
  title: "Components/IconBadge",
  component: IconBadge,
  parameters: { layout: "centered" },
} satisfies Meta<typeof IconBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconBadge tone="muted">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="primary">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="success" size="lg">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="warning" size="sm">
        <ShieldCheck />
      </IconBadge>
    </div>
  ),
};
