import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The family tree's shape while the server reads it, inside the console shell:
// the heading, the search toolbar, then the tree card with a few nested rows.
const ROWS = [0, 1, 1, 2, 1, 0, 1];

export default function FamilyTreeLoading() {
  return (
    <SkeletonRegion label="Loading the family tree…">
      <ConsoleHeadingSkeleton />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border bg-card p-2 shadow-sm sm:p-3">
          {ROWS.map((depth, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2"
              style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
