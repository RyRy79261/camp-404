import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The send screen's shape while the server reads the roster and the camp
// config: the Audience and Delivery cards, then the Send row.
export default function SendLoading() {
  return (
    <SkeletonRegion label="Loading the send screen…">
      <ConsoleHeadingSkeleton />
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {[2, 2].map((fields, card) => (
          <div
            key={card}
            className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: fields }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>
        ))}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
