import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Label } from "./label";
import { TextareaWithCount } from "./textarea-with-count";

const meta = {
  title: "Components/TextareaWithCount",
  component: TextareaWithCount,
  parameters: { layout: "padded" },
  args: { value: "", maxLength: 280 },
} satisfies Meta<typeof TextareaWithCount>;

export default meta;

type Story = StoryObj<typeof meta>;

function Controlled({
  start,
  maxLength,
}: {
  start: string;
  maxLength: number;
}) {
  const [value, setValue] = React.useState(start);
  return (
    <div className="flex max-w-md flex-col gap-2">
      <Label htmlFor="story-count">What do you bring to camp?</Label>
      <TextareaWithCount
        id="story-count"
        value={value}
        maxLength={maxLength}
        onChange={(e) => setValue(e.currentTarget.value)}
        rows={4}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Controlled start="A darkroom." maxLength={280} />,
};

export const NearTheLimit: Story = {
  render: () => <Controlled start={"x".repeat(260)} maxLength={280} />,
};
