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
      <IconBadge tone="accent">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="secondary">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="success" size="lg">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="warning" size="sm">
        <ShieldCheck />
      </IconBadge>
      <IconBadge tone="destructive">
        <ShieldCheck />
      </IconBadge>
    </div>
  ),
};

// The control-panel group heads (rounded `sm`) and tool-tile icon boxes
// (rounded `md`) — the shapes/sizes the home dashboard composes.
export const RoundedChips: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconBadge shape="rounded" size="sm" tone="primary">
        <ShieldCheck />
      </IconBadge>
      <IconBadge shape="rounded" size="sm" tone="accent">
        <ShieldCheck />
      </IconBadge>
      <IconBadge shape="rounded" size="sm" tone="secondary">
        <ShieldCheck />
      </IconBadge>
      <IconBadge shape="rounded" size="md" tone="primary">
        <ShieldCheck />
      </IconBadge>
    </div>
  ),
};
