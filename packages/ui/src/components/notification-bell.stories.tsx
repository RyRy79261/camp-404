import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationBell } from "./notification-bell";

const meta = {
  title: "Components/NotificationBell",
  component: NotificationBell,
  parameters: { layout: "centered" },
} satisfies Meta<typeof NotificationBell>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Nothing waiting — no badge, and the label says so. */
export const Empty: Story = { args: { count: 0 } };

/** The usual case: a handful of unread items. */
export const Unread: Story = { args: { count: 3 } };

/** Past the cap the badge reads "99+" while the label keeps the real number. */
export const Capped: Story = { args: { count: 128 } };
