import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Toaster, toast } from "./toast";

const meta = {
  title: "Components/Toast",
  component: Toaster,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-8">
      <Button onClick={() => toast("Heads up", { description: "A neutral note." })}>
        Info
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Saved", { description: "Your profile is updated." })
        }
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.warning("Careful", {
            description: "You haven't finished onboarding.",
          })
        }
      >
        Warning
      </Button>
      <Button
        variant="destructive"
        onClick={() => toast.error("Failed", { description: "Try again." })}
      >
        Error
      </Button>
      <Toaster />
    </div>
  ),
};
