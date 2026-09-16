import { SkeletonTable } from "@camp404/ui/components/skeleton";

// The answers table's shape while the server reads it. SkeletonTable is itself
// the announcing region, so it stands alone rather than inside another.
export default function ResponsesLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SkeletonTable rows={6} columns={4} label="Loading answers…" />
    </main>
  );
}
