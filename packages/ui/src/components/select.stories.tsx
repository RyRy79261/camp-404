import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta = {
  title: "Components/Select",
  component: Select,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Pick a team" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="kitchen">Kitchen</SelectItem>
        <SelectItem value="build">Build</SelectItem>
        <SelectItem value="fire">Fire</SelectItem>
        <SelectItem value="art">Art</SelectItem>
        <SelectItem value="safety">Safety</SelectItem>
      </SelectContent>
    </Select>
  ),
};
