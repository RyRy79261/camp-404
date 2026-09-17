import { SkeletonTable } from "@camp404/ui/components/skeleton";

// The audit table's shape while the server reads it. SkeletonTable is itself
// the announcing region, so it stands alone rather than inside another.
export default function AuditLogLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SkeletonTable rows={8} columns={5} label="Loading the audit log…" />
    </main>
  );
}
