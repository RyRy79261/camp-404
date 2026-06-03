import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopChrome } from "./top-chrome";

const meta = {
  title: "Components/TopChrome",
  component: TopChrome,
  parameters: { layout: "fullscreen" },
  args: { avatarInitials: "JR" },
} satisfies Meta<typeof TopChrome>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UnreadBadge: Story = {
  args: { unreadCount: 3 },
};

export const BadgeCapped: Story = {
  args: { unreadCount: 150 },
};

export const WithPhoto: Story = {
  args: {
    avatarImageUrl: "https://i.pravatar.cc/80?img=12",
    unreadCount: 3,
  },
};

export const NullInitials: Story = {
  args: { avatarInitials: "?" },
};
