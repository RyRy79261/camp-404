import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stepper } from "./stepper";

const meta = {
  title: "Components/Stepper",
  component: Stepper,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Stepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwoStep: Story = {
  args: {
    steps: [
      { label: "Request sent", status: "done" },
      { label: "Accepted", status: "active" },
    ],
  },
};

export const Onboarding: Story = {
  args: {
    steps: [
      { label: "Invite", status: "done" },
      { label: "Profile", status: "active" },
      { label: "Approved", status: "upcoming" },
    ],
  },
};
