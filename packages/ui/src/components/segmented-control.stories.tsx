import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { SegmentedControl } from "./segmented-control";

const meta = {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { options: [{ value: "a", label: "A" }], onValueChange: () => {} },
  render: () => {
    const [v, setV] = React.useState("maybe");
    return (
      <div className="w-72">
        <SegmentedControl
          aria-label="Are you attending?"
          options={[
            { value: "yes", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "No" },
          ]}
          value={v}
          onValueChange={setV}
        />
      </div>
    );
  },
};
