import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// One member's answers while the server reads them: the breadcrumb, the
// heading, then a card of question-and-answer rows.
export default function RespondentLoading() {
  return (
    <SkeletonRegion label="Loading this member's answers…">
      <Skeleton className="mb-4 h-4 w-64 max-w-full" />
      <ConsoleHeadingSkeleton eyebrow={false} />
      <div className="flex max-w-3xl flex-col divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
