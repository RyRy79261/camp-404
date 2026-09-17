import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The camp's year while the server plans the rollover: the plan's cards in the
// main column, what stays untouched beside them.
export default function CycleLoading() {
  return (
    <SkeletonRegion label="Loading the camp's year…">
      <ConsoleHeadingSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
