import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { OptionCardGroup } from "./option-card-group";

const meta = {
  title: "Components/OptionCardGroup",
  component: OptionCardGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OptionCardGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { options: [{ value: "a", label: "A" }], onValueChange: () => {} },
  // A named component, so the Rules of Hooks see useState inside one.
  render: function Render() {
    const [v, setV] = React.useState("going");
    return (
      <div className="w-96">
        <OptionCardGroup
          aria-label="Coming this year?"
          options={[
            {
              value: "going",
              label: "Yes",
              description: "Count me in for this year's burn.",
            },
            {
              value: "maybe",
              label: "Maybe",
              description: "Still working it out.",
            },
          ]}
          value={v}
          onValueChange={setV}
        />
      </div>
    );
  },
};
