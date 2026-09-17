import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import {
  ConsoleHeadingSkeleton,
  ConsoleTableSkeleton,
} from "@/components/console/console-skeleton";

// The answers table's shape while the server reads it: the heading, the view
// switch with the export beside it, then the table.
export default function ResponsesLoading() {
  return (
    <SkeletonRegion label="Loading answers…">
      <ConsoleHeadingSkeleton action />
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Skeleton className="h-11 w-full rounded-md sm:w-56" />
        <Skeleton className="hidden h-10 w-32 rounded-md sm:block" />
      </div>
      <ConsoleTableSkeleton rows={6} columns={4} filters={false} />
    </SkeletonRegion>
  );
}
