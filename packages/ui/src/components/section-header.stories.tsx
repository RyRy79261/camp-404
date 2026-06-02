import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { SectionHeader } from "./section-header";

const meta = {
  title: "Components/SectionHeader",
  component: SectionHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SectionHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAction: Story = {
  args: { title: "Camp management" },
  render: () => (
    <div className="w-[28rem]">
      <SectionHeader
        title="Camp management"
        description="Everyone who has signed up, their rank and status."
        action={
          <Button size="sm" variant="outline">
            Export
          </Button>
        }
      />
    </div>
  ),
};

export const TitleOnly: Story = {
  args: { title: "Announcements" },
};
