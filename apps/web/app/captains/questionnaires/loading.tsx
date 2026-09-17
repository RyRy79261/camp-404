import { SkeletonList } from "@camp404/ui/components/skeleton";

// The wait for the questionnaire builder pages without their own loading.tsx:
// a list of cards, the hub's shape. Results and answers keep their own files.
export default function QuestionnairesLoading() {
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <SkeletonList rows={4} avatar={false} label="Loading questionnaires…" />
    </main>
  );
}
