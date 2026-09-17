import { SkeletonRegion } from "@camp404/ui/components/skeleton";
import {
  ConsoleHeadingSkeleton,
  ConsoleTableSkeleton,
} from "@/components/console/console-skeleton";

// The audit table's shape while the server reads it, inside the console shell.
export default function AuditLogLoading() {
  return (
    <SkeletonRegion label="Loading the audit log…">
      <ConsoleHeadingSkeleton />
      <ConsoleTableSkeleton rows={8} columns={5} filters={false} />
    </SkeletonRegion>
  );
}
