import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NumericAggregate } from "@camp404/core";
import { MetricCard } from "../metric-card";

// The numeric summary's two empty states. They are separate on purpose: a
// question nobody answered and a question everybody answered in words are
// different problems, and only one of them is the captain's to fix.

function numeric(over: {
  answered: number;
  samples: number;
  unparsed: number;
}): NumericAggregate {
  return {
    shape: "numeric",
    questionId: "nights",
    prompt: "How many nights?",
    kind: "number",
    respondents: 10,
    answered: over.answered,
    skipped: 10 - over.answered,
    answeredPct: over.answered * 10,
    samples: over.samples,
    unparsed: over.unparsed,
    min: null,
    max: null,
    mean: null,
    median: null,
    buckets: [],
    enumerated: false,
  };
}

describe("MetricCard — the numeric empty states", () => {
  it("says nothing came back when nobody answered", () => {
    render(
      <MetricCard result={numeric({ answered: 0, samples: 0, unparsed: 0 })} />,
    );
    expect(screen.getByText("No answers yet.")).toBeTruthy();
  });

  it("does not claim there are no answers when the answers are unusable", () => {
    // THE REGRESSION: with samples 0 but unparsed 3, the card used to print
    // "No answers yet." directly under a Skips line reading "3 of 10
    // answered" — two statements contradicting each other on one card.
    render(
      <MetricCard result={numeric({ answered: 3, samples: 0, unparsed: 3 })} />,
    );
    expect(screen.queryByText("No answers yet.")).toBeNull();
    expect(screen.getByText(/none of them a number/i)).toBeTruthy();
  });
});
