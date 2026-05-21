import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

const meta = {
  title: "Components/Card",
  component: Card,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Dance of 1000 Flames</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Camp 404's fire jam, held immediately before the Clan burns on
          Saturday night.
        </p>
        <Button size="sm">View schedule</Button>
      </CardContent>
    </Card>
  ),
};
