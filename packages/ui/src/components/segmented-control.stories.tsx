import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { SegmentedControl, SegmentedLinks } from "./segmented-control";

const meta = {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { options: [{ value: "a", label: "A" }], onValueChange: () => {} },
  render: () => {
    const [v, setV] = React.useState("maybe");
    return (
      <div className="w-72">
        <SegmentedControl
          aria-label="Are you attending?"
          options={[
            { value: "yes", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "No" },
          ]}
          value={v}
          onValueChange={setV}
        />
      </div>
    );
  },
};

/**
 * The same row drawn as links, for a filter whose state lives in the URL — the
 * notification inbox's tabs. Rendered here with plain anchors; a Next.js app
 * passes `linkAs={Link}`.
 */
export const Links: Story = {
  args: { options: [{ value: "a", label: "A" }], onValueChange: () => {} },
  render: () => (
    <div className="w-96">
      <SegmentedLinks
        aria-label="Filter notifications"
        value="unread"
        options={[
          { value: "all", label: "All", href: "/notifications" },
          {
            value: "unread",
            label: "Unread · 4",
            href: "/notifications?filter=unread",
          },
          {
            value: "announcements",
            label: "Announcements",
            href: "/notifications?filter=announcements",
          },
        ]}
      />
    </div>
  ),
};
