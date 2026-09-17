import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The invite page's shape while the server reads the codes, inside the console
// shell: the heading, the code list in the main column and the form beside it.
export default function InviteLoading() {
  return (
    <SkeletonRegion label="Loading your invites…">
      <ConsoleHeadingSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-start-3 lg:row-start-1 lg:self-start">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-4 w-full" />
          <div className="mt-6 flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
          <div className="mt-6 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-lg border border-border px-4 py-3"
              >
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-44 max-w-full" />
                  </div>
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
