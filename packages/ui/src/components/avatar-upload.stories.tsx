import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { AvatarUpload } from "./avatar-upload";

const meta = {
  title: "Components/AvatarUpload",
  component: AvatarUpload,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AvatarUpload>;

export default meta;

type Story = StoryObj<typeof meta>;

// A sample square so Populated renders without hitting the avatar proxy.
const SAMPLE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#c084fc"/></svg>',
  );

export const Empty: Story = {
  args: { value: null, onChange: () => {} },
};

export const Populated: Story = {
  args: { value: SAMPLE, onChange: () => {} },
};

// Interactive: the upload/error states are internal, so the playground wires a
// stub uploadUrl + preprocess to let you drive a real pick → upload cycle.
export const InteractivePlayground: Story = {
  args: { value: null, onChange: () => {} },
  render: () => {
    const [value, setValue] = React.useState<string | null>(null);
    return (
      <AvatarUpload
        value={value}
        onChange={setValue}
        preprocessImage={async (file) => file}
        uploadUrl="/api/uploads/avatar"
      />
    );
  },
};
