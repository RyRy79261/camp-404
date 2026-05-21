import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta = {
  title: "Components/Input",
  component: Input,
  parameters: { layout: "centered" },
  args: { placeholder: "Camp name", className: "w-64" },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, value: "Camp 404" } };
export const Email: Story = {
  args: { type: "email", placeholder: "you@camp-404.com" },
};
