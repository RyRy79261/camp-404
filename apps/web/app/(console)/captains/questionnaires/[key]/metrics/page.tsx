import { ResultsPage } from "./results-page";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questionnaire results — Camp 404" };

// Results, opened on the Summary tab. The page itself is ./results-page.tsx,
// shared with /responses, which opens on Individual.
export default async function MetricsPage({
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
      initialTab="summary"
    />
  );
}
