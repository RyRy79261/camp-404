import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The canvas's shape while the server reads the definition: a card per page
// with its block rows, and the rail beside them (the name field and the
// lifecycle card).
export default function BuilderLoading() {
  return (
    <SkeletonRegion label="Loading the questionnaire…">
      <ConsoleHeadingSkeleton />
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-5 lg:order-last">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          {Array.from({ length: 2 }).map((_, page) => (
            <div
              key={page}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
              {Array.from({ length: 3 }).map((_, row) => (
                <Skeleton key={row} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
