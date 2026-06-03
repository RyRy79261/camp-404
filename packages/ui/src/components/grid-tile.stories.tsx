import type { Meta, StoryObj } from "@storybook/react-vite";
import { Megaphone, Users } from "lucide-react";
import { GridTile } from "./grid-tile";

const meta = {
  title: "Components/GridTile",
  component: GridTile,
  parameters: { layout: "centered" },
} satisfies Meta<typeof GridTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  render: () => (
    <div className="grid w-80 grid-cols-2 gap-3">
      <GridTile>
        <Megaphone className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">Announcements</span>
      </GridTile>
      <GridTile>
        <Users className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">Roster</span>
      </GridTile>
    </div>
  ),
};
