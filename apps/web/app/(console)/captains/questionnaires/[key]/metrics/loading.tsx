import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The summary's shape while the server reads the year's answers: the heading,
// the badges and view switch, the KPI cards, then a card per question. One
// region for the whole page, so the wait is announced once.
export default function MetricsLoading() {
  return (
    <SkeletonRegion label="Loading results…">
      <ConsoleHeadingSkeleton action />
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mb-6 h-11 w-full rounded-md sm:w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-2 w-3/4 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
