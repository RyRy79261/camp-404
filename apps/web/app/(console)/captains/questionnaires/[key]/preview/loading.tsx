import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The preview's shape while the server reads the definition: the heading with
// its Edit action, then the form card.
export default function PreviewLoading() {
  return (
    <SkeletonRegion label="Loading the preview…">
      <ConsoleHeadingSkeleton action />
      <div className="flex w-full max-w-2xl flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-6 w-56" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
