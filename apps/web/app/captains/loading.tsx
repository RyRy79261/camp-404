import { SkeletonPage } from "@camp404/ui/components/skeleton";

// The wait for a captain page without its own loading.tsx: the captain pages'
// container, one announcing skeleton region.
export default function CaptainsLoading() {
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <SkeletonPage rows={5} label="Loading camp tools…" />
    </main>
  );
}
