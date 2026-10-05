import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Switch } from "./switch";
import { Label } from "./label";

const meta = {
  title: "Components/Switch",
  component: Switch,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // A named component, so the Rules of Hooks see useState inside one.
  render: function Render() {
    const [on, setOn] = React.useState(true);
    return (
      <div className="flex items-center gap-2">
        <Switch id="push" checked={on} onCheckedChange={setOn} />
        <Label htmlFor="push">Push notifications</Label>
      </div>
    );
  },
};
