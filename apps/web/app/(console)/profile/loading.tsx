import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The profile's shape while the server reads it, inside the console shell: the
// heading, the section pills, then the identity card beside the side cards.
export default function ProfileLoading() {
  return (
    <SkeletonRegion label="Loading your profile…">
      <ConsoleHeadingSkeleton />
      <div className="flex flex-col gap-6">
        <div className="inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1">
          <Skeleton className="h-7 w-20 rounded-sm" />
          <Skeleton className="h-7 w-24 rounded-sm" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
              <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-7 w-48 max-w-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-72 max-w-full" />
              <Skeleton className="mt-6 h-9 w-36 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border bg-card p-6 shadow-sm">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-6 h-9 w-32 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
