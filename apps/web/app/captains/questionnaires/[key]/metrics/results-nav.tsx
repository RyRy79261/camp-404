"use client";

import { useRouter } from "next/navigation";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";

// The two switches every results screen carries: which view (aggregate vs.
// individual answers) and which year.
//
// `packages/ui` has no Tabs primitive, and a results view is a single choice
// from a small mutually-exclusive set — which is exactly what SegmentedControl
// already is, with the radiogroup semantics and arrow-key roving a hand-rolled
// tab strip would have had to reinvent. Navigation rather than local state, so
// a year is a URL a captain can link to.
//
// Lives under metrics/ and is imported by /responses: the two routes are one
// surface with two views, and the switch has to render identically on both.

export type ResultsViewName = "metrics" | "responses";

export interface CycleOption {
  value: number;
  label: string;
}

export interface ResultsNavProps {
  questionnaireKey: string;
  view: ResultsViewName;
  cycle: number;
  cycles: CycleOption[];
}

export function ResultsNav({
  questionnaireKey,
  view,
  cycle,
  cycles,
}: ResultsNavProps) {
  const router = useRouter();

  function go(nextView: ResultsViewName, nextCycle: number) {
    router.push(
      `/captains/questionnaires/${questionnaireKey}/${nextView}?cycle=${nextCycle}`,
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        aria-label="Results view"
        value={view}
        onValueChange={(v) => go(v as ResultsViewName, cycle)}
        options={[
          { value: "metrics", label: "Summary" },
          { value: "responses", label: "Answers" },
        ]}
      />
      {cycles.length > 1 && (
        <SegmentedControl
          aria-label="Year"
          value={String(cycle)}
          onValueChange={(v) => go(view, Number(v))}
          options={cycles.map((c) => ({
            value: String(c.value),
            label: c.label,
          }))}
        />
      )}
    </div>
  );
}
