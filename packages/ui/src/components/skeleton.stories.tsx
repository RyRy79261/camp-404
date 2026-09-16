import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Skeleton,
  SkeletonCard,
  SkeletonForm,
  SkeletonList,
  SkeletonPage,
  SkeletonTable,
  SkeletonText,
} from "./skeleton";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primitives: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-4">
      <Skeleton className="h-8 w-full" />
      <SkeletonText lines={4} />
    </div>
  ),
};

export const Regions: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-6">
      <SkeletonCard />
      <SkeletonList rows={4} />
      <SkeletonForm fields={2} />
    </div>
  ),
};

export const Roster: Story = {
  render: () => (
    <div className="w-[560px]">
      <SkeletonTable rows={5} columns={4} label="Loading roster…" />
    </div>
  ),
};

export const Page: Story = {
  render: () => (
    <div className="w-96">
      <SkeletonPage />
    </div>
  ),
};
