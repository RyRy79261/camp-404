import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The hub's shape while the server reads it, inside the console shell: the
// heading with its "New questionnaire" action, then a card per questionnaire.
export default function QuestionnairesLoading() {
  return (
    <SkeletonRegion label="Loading questionnaires…">
      <ConsoleHeadingSkeleton action />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
