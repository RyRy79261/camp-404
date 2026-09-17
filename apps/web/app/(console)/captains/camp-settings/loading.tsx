import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import {
  ConsoleHeadingSkeleton,
  ConsoleTableSkeleton,
} from "@/components/console/console-skeleton";

// Camp settings while the server reads the teams: the team table in the main
// column, the camp's year card beside it.
export default function CampSettingsLoading() {
  return (
    <SkeletonRegion label="Loading camp settings…">
      <ConsoleHeadingSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConsoleTableSkeleton rows={8} columns={3} filters={false} />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    </SkeletonRegion>
  );
}
