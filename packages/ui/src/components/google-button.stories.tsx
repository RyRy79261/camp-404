import type { Meta, StoryObj } from "@storybook/react-vite";
import { OAuthButton } from "./google-button";

const meta = {
  title: "Components/OAuthButton",
  component: OAuthButton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OAuthButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Google: Story = {
  render: () => (
    <div className="w-80">
      <OAuthButton />
    </div>
  ),
};
