"use client";

import { useRouter } from "next/navigation";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";

// The year switch on a results page. Navigation rather than local state, so a
// year is a URL a captain can link to, and another year's answers are read
// only when someone asks for them.
//
// The tab is read from the address bar at the moment of the switch, not passed
// in: Summary and Individual rewrite it between /metrics and /responses without
// a round trip, and the new year opens on whichever tab is showing.

export interface CycleOption {
  value: number;
  label: string;
}

export function YearSwitch({
  questionnaireKey,
  cycle,
  cycles,
  className,
}: {
  questionnaireKey: string;
  cycle: number;
  cycles: CycleOption[];
  className?: string;
}) {
  const router = useRouter();
  if (cycles.length < 2) return null;

  function go(next: string) {
    if (next === String(cycle)) return;
    const view = window.location.pathname.endsWith("/responses")
      ? "responses"
      : "metrics";
    router.push(
      `/captains/questionnaires/${questionnaireKey}/${view}?cycle=${Number(next)}`,
    );
  }

  return (
    <SegmentedControl
      className={className}
      aria-label="Year"
      value={String(cycle)}
      onValueChange={go}
      options={cycles.map((c) => ({
        value: String(c.value),
        label: <span className="whitespace-nowrap">{c.label}</span>,
      }))}
    />
  );
}
