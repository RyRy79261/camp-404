import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// Announcements while the server reads them: the draft and published cards in
// the main column, the composer card beside them.
export default function AnnouncementsLoading() {
  return (
    <SkeletonRegion label="Loading announcements…">
      <ConsoleHeadingSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex flex-col gap-8">
          {[2, 3].map((cards, section) => (
            <div key={section} className="flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              {Array.from({ length: cards }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
        <Skeleton className="h-[34rem] w-full rounded-xl" />
      </div>
    </SkeletonRegion>
  );
}
