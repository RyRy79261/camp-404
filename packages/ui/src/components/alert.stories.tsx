import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleCheck, Info, TriangleAlert, XCircle } from "lucide-react";
import { Alert } from "./alert";

const meta = {
  title: "Components/Alert",
  component: Alert,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <Alert variant="info">
        <Info />
        <span>Heads up — the questionnaire takes about 5 minutes.</span>
      </Alert>
      <Alert variant="success">
        <CircleCheck />
        <span>Your profile is saved.</span>
      </Alert>
      <Alert variant="warning">
        <TriangleAlert />
        <span>You haven&apos;t finished onboarding yet.</span>
      </Alert>
      <Alert variant="error">
        <XCircle />
        <span>Something went wrong — try again.</span>
      </Alert>
    </div>
  ),
};
