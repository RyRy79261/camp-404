import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import {
  ConsoleHeadingSkeleton,
  ConsoleTableSkeleton,
} from "@/components/console/console-skeleton";

// The roster's shape while the server reads it: the heading with its export
// action, the KPI cards a captain sees, then the filter strip and the table.
export default function RosterLoading() {
  return (
    <SkeletonRegion label="Loading the roster…">
      <ConsoleHeadingSkeleton action />
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:p-5"
          >
            <Skeleton className="h-3 w-full max-w-20" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="hidden h-3 w-full max-w-32 sm:block" />
          </div>
        ))}
      </div>
      <ConsoleTableSkeleton rows={8} columns={5} />
    </SkeletonRegion>
  );
}
