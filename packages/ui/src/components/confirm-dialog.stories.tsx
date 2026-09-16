import type { Meta, StoryObj } from "@storybook/react-vite"
import { ConfirmDialog } from "./confirm-dialog"

const meta = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "centered" },
  args: {
    open: true,
    onOpenChange: () => {},
    onConfirm: () => {},
    title: "Delete this questionnaire?",
    description: "It is a draft, so nobody has answered it. This can't be undone.",
    confirmLabel: "Delete",
  },
} satisfies Meta<typeof ConfirmDialog>

export default meta

type Story = StoryObj<typeof meta>

export const Destructive: Story = { args: { destructive: true } }

export const Neutral: Story = {
  args: {
    title: "Publish this announcement?",
    description: "It goes to every approved member as a pop-up.",
    confirmLabel: "Publish to 42 members",
  },
}

export const Pending: Story = { args: { destructive: true, pending: true } }

export const Failed: Story = {
  args: {
    destructive: true,
    error: "Couldn't delete it just now. Please try again.",
  },
}
