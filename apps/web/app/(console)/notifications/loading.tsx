import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The inbox's shape while the server reads it, inside the console shell: the
// heading, then two day groups of rows in their cards.
export default function NotificationsLoading() {
  return (
    <SkeletonRegion label="Loading your notifications…">
      <ConsoleHeadingSkeleton />
      <div className="flex flex-col gap-6">
        {[3, 2].map((rows, group) => (
          <div key={group} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <div className="rounded-xl border bg-card p-1 shadow-sm">
              {Array.from({ length: rows }).map((_, r) => (
                <div
                  key={r}
                  className="flex items-start gap-3 border-b border-border px-3 py-3 last:border-b-0"
                >
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <Skeleton className="h-4 w-48 max-w-full" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-3.5 w-full max-w-xl" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
