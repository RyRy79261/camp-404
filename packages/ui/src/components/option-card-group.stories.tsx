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
  render: () => {
    const [v, setV] = React.useState("full");
    return (
      <div className="w-96">
        <OptionCardGroup
          aria-label="Membership tier"
          options={[
            {
              value: "full",
              label: "Full membership",
              description: "All of build week plus the event.",
            },
            {
              value: "build",
              label: "Build week only",
              description: "Just the setup days.",
            },
          ]}
          value={v}
          onValueChange={setV}
        />
      </div>
    );
  },
};
