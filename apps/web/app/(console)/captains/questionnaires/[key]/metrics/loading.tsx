import { SkeletonPage } from "@camp404/ui/components/skeleton";

// The summary's shape while the server reads the year's answers. One skeleton
// region for the whole page — SkeletonPage carries the single announcement, so
// nothing here nests a second one.
export default function MetricsLoading() {
  return (
    <main className="mx-auto max-w-lg px-2 py-4">
      <SkeletonPage rows={4} label="Loading results…" />
    </main>
  );
}
