import { ResultsPage } from "../metrics/results-page";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire answers — Camp 404" };

// Results, opened on the Individual tab (docs/questionnaire-builder.md §7.3):
// one row per member the send reached, with their status, a column per
// question, and each member's answers in a dialog. The CSV is built by
// ./export/route.ts when a captain presses Export. The page itself is
// ../metrics/results-page.tsx, shared with /metrics.
export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { key } = await params;
  const { cycle } = await searchParams;
  return (
    <ResultsPage
      questionnaireKey={key}
      cycleParam={cycle}
      initialTab="individual"
    />
  );
}
