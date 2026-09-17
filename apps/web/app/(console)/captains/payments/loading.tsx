import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import {
  ConsoleHeadingSkeleton,
  ConsoleTableSkeleton,
} from "@/components/console/console-skeleton";

// The ledger's shape while the server reads it: the table in the main column,
// the dues count and the record form in the side rail.
export default function PaymentsLoading() {
  return (
    <SkeletonRegion label="Loading payments…">
      <ConsoleHeadingSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Skeleton className="h-3 w-40" />
          <ConsoleTableSkeleton rows={6} columns={5} filters={false} />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
