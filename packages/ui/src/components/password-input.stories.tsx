import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Label } from "./label";
import { PasswordInput } from "./password-input";

const meta = {
  title: "Components/PasswordInput",
  component: PasswordInput,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PasswordInput>;

export default meta;

type Story = StoryObj<typeof meta>;

function Controlled({
  label,
  start,
  hideStrength,
  autoComplete,
}: {
  label: string;
  start: string;
  hideStrength?: boolean;
  autoComplete: string;
}) {
  const [value, setValue] = React.useState(start);
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Label htmlFor="story-password">{label}</Label>
      <PasswordInput
        id="story-password"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        autoComplete={autoComplete}
        placeholder="A sentence you'll remember"
        hideStrength={hideStrength}
      />
    </div>
  );
}

/** Sign-up: the meter is on, and the field starts below the minimum. */
export const TooShort: Story = {
  render: () => (
    <Controlled label="Password" start="hunter2" autoComplete="new-password" />
  ),
};

export const Fair: Story = {
  render: () => (
    <Controlled
      label="Password"
      start="correct horse b"
      autoComplete="new-password"
    />
  ),
};

export const Strong: Story = {
  render: () => (
    <Controlled
      label="Password"
      start="correct horse battery staple lantern"
      autoComplete="new-password"
    />
  ),
};

/** Sign-in, and the confirm field: no meter — it would only be noise. */
export const NoMeter: Story = {
  render: () => (
    <Controlled
      label="Password"
      start="correct horse battery staple"
      autoComplete="current-password"
      hideStrength
    />
  ),
};

/** Uncontrolled, empty: the toggle is there before anything is typed. */
export const Empty: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2">
      <Label htmlFor="story-password-empty">Password</Label>
      <PasswordInput
        id="story-password-empty"
        autoComplete="new-password"
        placeholder="A sentence you'll remember"
      />
    </div>
  ),
};
