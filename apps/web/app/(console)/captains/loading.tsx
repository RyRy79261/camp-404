import {
  SkeletonCardGrid,
  SkeletonRegion,
} from "@camp404/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console/console-skeleton";

// The wait for a captain page without its own loading.tsx: the heading, then
// cards, inside the console shell (the header and nav stay on screen).
export default function CaptainsLoading() {
  return (
    <SkeletonRegion label="Loading…">
      <ConsoleHeadingSkeleton />
      <SkeletonCardGrid cards={3} lines={2} />
    </SkeletonRegion>
  );
}
