import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The profile editor's shape while the server reads it: the heading, the
// section pills, then the photo-and-name card and the deletion card.
export default function ProfileEditLoading() {
  return (
    <SkeletonRegion label="Loading the profile editor…">
      <ConsoleHeadingSkeleton />
      <div className="flex flex-col gap-6">
        <div className="inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1">
          <Skeleton className="h-7 w-20 rounded-sm" />
          <Skeleton className="h-7 w-24 rounded-sm" />
        </div>
        <div className="flex max-w-3xl flex-col gap-6">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-72 max-w-full" />
            <div className="mt-6 flex flex-col gap-6 sm:flex-row">
              <Skeleton className="h-[120px] w-[120px] shrink-0 self-center rounded-full sm:self-start" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
            <Skeleton className="mt-4 h-10 w-full max-w-sm rounded-md" />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
