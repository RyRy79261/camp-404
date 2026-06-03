import type { Meta, StoryObj } from "@storybook/react-vite";
import { InputField } from "./input-field";

const meta = {
  title: "Components/InputField",
  component: InputField,
  parameters: { layout: "padded" },
} satisfies Meta<typeof InputField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Display name",
    placeholder: "Dusty Boot",
    helper: "How you'll show up on the roster.",
  },
};

export const WithError: Story = {
  args: {
    label: "Invite code",
    defaultValue: "nope",
    error: "That code isn't valid.",
  },
};
