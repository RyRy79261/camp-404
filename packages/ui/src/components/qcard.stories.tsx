import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { QCard } from "./qcard";

const meta = {
  title: "Components/QCard",
  component: QCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof QCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "What's your camp name?",
    required: true,
    helper: "The name fellow burners will know you by.",
    htmlFor: "qcard-name",
    children: null,
  },
  render: (args) => (
    <div className="w-96">
      <QCard {...args}>
        <Input id="qcard-name" placeholder="Dusty Boot" />
      </QCard>
    </div>
  ),
};
