import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { DateControl } from "./date-control";

const meta = {
  title: "Components/DateControl",
  component: DateControl,
  parameters: { layout: "centered" },
} satisfies Meta<typeof DateControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState("2026-09-01");
    return (
      <div className="w-56">
        <DateControl value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
    );
  },
};
