import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  aggregateQuestions,
  type NumericAggregate,
  type ResponseAggregate,
} from "@camp404/core";
import type { Question, QuestionnaireResponses } from "@camp404/types";
import {
  ResultsView,
  type ResultColumnView,
  type ResultRowView,
  type ResultsViewProps,
} from "../results-view";

// The results view draws what @camp404/core aggregated, and nothing else. The
// privacy half is asserted against the REAL engine: what a member typed must
// not reach the Summary, whatever the view does.

const QUESTIONS: Question[] = [
  {
    id: "diet",
    kind: "short_text",
    prompt: "Anything we should know about your diet?",
    maxLength: 200,
    required: false,
  },
  {
    id: "tent",
    kind: "single_select",
    prompt: "Which tent?",
    required: false,
    allowOther: true,
    options: [
      { value: "dome", label: "Dome" },
      { value: "bell", label: "Bell" },
    ],
  },
  {
    id: "vibe",
    kind: "rating",
    prompt: "Rate the build",
    required: false,
    steps: 5,
  },
  {
    id: "energy",
    kind: "linear_scale",
    prompt: "Energy level",
    required: false,
    min: 1,
    max: 3,
    minLabel: "Flat",
    maxLabel: "Buzzing",
  },
  {
    id: "arrive",
    kind: "time",
    prompt: "When do you arrive?",
    required: false,
  },
] as Question[];

const RESPONSES: QuestionnaireResponses[] = [
  {
    diet: "No shellfish, I carry an EpiPen",
    tent: "other:my cousin's caravan",
    vibe: 5,
    energy: 3,
    arrive: "09:00",
    gone: "An answer to a removed question",
  },
  {
    diet: "Vegan",
    tent: "other:a hammock",
    vibe: 4,
    energy: 1,
    arrive: "14:30",
  },
  { tent: "dome", vibe: 5 },
];

const COLUMNS: ResultColumnView[] = [
  {
    id: "diet",
    label: "Anything we should know about your diet?",
    removed: false,
  },
  { id: "tent", label: "Which tent?", removed: false },
  { id: "gone", label: "gone", removed: true },
];

const ROWS: ResultRowView[] = [
  {
    userId: "u1",
    name: "Ada",
    status: "completed",
    completedLabel: "2 Feb 2027, 10:00",
    answers: [
      "No shellfish, I carry an EpiPen",
      "Other: my cousin's caravan",
      "An answer to a removed question",
    ],
    version: "3",
  },
  {
    userId: "u2",
    name: "Bo",
    status: "completed",
    completedLabel: "2 Feb 2027, 11:00",
    answers: ["Vegan", "Other: a hammock", ""],
    version: "3",
  },
  {
    userId: "u3",
    name: "Cy",
    status: "pending",
    completedLabel: "—",
    answers: null,
    version: null,
  },
];

function renderView(over: Partial<ResultsViewProps> = {}) {
  return render(
    <ResultsView
      questionnaireKey="gear"
      cycle={2027}
      summary={aggregateQuestions(QUESTIONS, RESPONSES)}
      questions={QUESTIONS}
      rows={ROWS}
      columns={COLUMNS}
      exportHref="/captains/questionnaires/gear/responses/export?cycle=2027"
      empty={null}
      {...over}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ResultsView — Summary", () => {
  it("never puts what a member typed on the summary", () => {
    renderView();
    const summary = screen.getByRole("region", { name: "Summary" });
    // Free text is a count…
    expect(within(summary).queryByText(/EpiPen/)).toBeNull();
    expect(within(summary).queryByText("Vegan")).toBeNull();
    // …"Other…" answers are one counted row, never quoted…
    expect(within(summary).queryByText(/caravan|hammock/)).toBeNull();
    const tent = screen
      .getByRole("heading", { name: "Which tent?" })
      .closest<HTMLElement>("[class*='rounded-xl']")!;
    expect(within(tent).getByText("Other…")).toBeTruthy();
    // Both typed answers, counted in one row.
    expect(within(tent).getByText("2 · 67%")).toBeTruthy();
    // …and a removed question is counted, never shown.
    expect(within(summary).queryByText(/removed question/)).toBeNull();
    expect(within(summary).getByText("gone")).toBeTruthy();
    expect(
      within(summary).getByText(
        /1 question was removed after people answered it/,
      ),
    ).toBeTruthy();
  });

  it("puts the skips beside every question", () => {
    renderView();
    // Two of three answered the diet question.
    expect(
      screen.getAllByText("2 answered · 1 skipped").length,
    ).toBeGreaterThan(0);
  });

  it("draws a rating as stars with its average out of the steps", () => {
    renderView();
    expect(screen.getByText(/out of 5/)).toBeTruthy();
    expect(screen.getByText("4.67")).toBeTruthy();
  });

  it("labels a linear scale's ends", () => {
    renderView();
    expect(screen.getByText("1 — Flat")).toBeTruthy();
    expect(screen.getByText("3 — Buzzing")).toBeTruthy();
  });

  it("gives a time its earliest and latest", () => {
    renderView();
    expect(screen.getByText(/Earliest 09:00 · latest\s+14:30/)).toBeTruthy();
  });

  it("sends a captain to the Individual tab to read text answers", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    renderView();
    fireEvent.click(
      screen.getAllByRole("button", { name: /See individual answers/ })[0]!,
    );
    expect(screen.getByRole("region", { name: "Individual" })).toBeTruthy();
    expect(replace).toHaveBeenCalledWith(
      null,
      "",
      "/captains/questionnaires/gear/responses?cycle=2027",
    );
  });

  it("shows the empty state instead of charts when nobody has answered", () => {
    renderView({
      summary: aggregateQuestions(QUESTIONS, []),
      rows: [],
      empty: { title: "No answers yet", description: "Nobody yet." },
    });
    expect(screen.getByText("No answers yet")).toBeTruthy();
    expect(screen.queryByText("Which tent?")).toBeNull();
    // Nothing to export.
    expect(screen.getByRole("button", { name: /Export CSV/ })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

function numeric(over: {
  answered: number;
  samples: number;
  unparsed: number;
}): ResponseAggregate {
  const aggregate: NumericAggregate = {
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
  return { respondents: 10, questions: [aggregate], orphans: [] };
}

describe("ResultsView — the numeric empty states", () => {
  it("says nobody answered when nobody did", () => {
    renderView({ summary: numeric({ answered: 0, samples: 0, unparsed: 0 }) });
    expect(screen.getByText("Nobody answered this question.")).toBeTruthy();
  });

  it("does not claim there are no answers when the answers are unusable", () => {
    // With samples 0 but unparsed 3, "nobody answered" would contradict the
    // "3 answered" beside the question.
    renderView({ summary: numeric({ answered: 3, samples: 0, unparsed: 3 }) });
    expect(screen.queryByText("Nobody answered this question.")).toBeNull();
    expect(screen.getByText(/none of them a number/i)).toBeTruthy();
  });
});

describe("ResultsView — Individual", () => {
  it("opens on Individual from /responses, in a table named Answers", () => {
    renderView({ initialTab: "individual" });
    const table = screen.getByRole("table", { name: "Answers" });
    expect(within(table).getByText("Ada")).toBeTruthy();
    expect(within(table).getByText("Pending")).toBeTruthy();
    // A column per question on a wide screen.
    expect(within(table).getByText("Vegan")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /Export CSV/ })[0],
    ).toHaveProperty(
      "href",
      expect.stringContaining("/responses/export?cycle=2027"),
    );
  });

  it("reads one member's answers in a dialog, and links to their page", () => {
    renderView({ initialTab: "individual" });
    fireEvent.click(
      screen.getAllByRole("button", { name: "View Ada’s response" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ada’s response")).toBeTruthy();
    expect(
      within(dialog).getByText(/Submitted 2 Feb 2027, 10:00/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("No shellfish, I carry an EpiPen"),
    ).toBeTruthy();
    // Her answer to the removed question is hers to see, marked removed.
    expect(within(dialog).getByText("removed")).toBeTruthy();
    expect(
      within(dialog).getByRole("link", { name: "Open as a page" }),
    ).toHaveProperty(
      "href",
      expect.stringContaining(
        "/captains/questionnaires/gear/responses/u1?cycle=2027",
      ),
    );
  });

  it("leaves out a removed question the member never answered", () => {
    renderView({ initialTab: "individual" });
    fireEvent.click(
      screen.getAllByRole("button", { name: "View Bo’s response" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Vegan")).toBeTruthy();
    expect(within(dialog).queryByText("removed")).toBeNull();
  });

  it("offers no viewer for a member who hasn't answered", () => {
    renderView({ initialTab: "individual" });
    expect(screen.queryAllByRole("button", { name: /View Cy/ })).toHaveLength(
      0,
    );
  });
});
