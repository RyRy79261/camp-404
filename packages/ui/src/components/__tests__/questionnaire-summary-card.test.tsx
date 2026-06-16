import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { QuestionnaireSummaryCard } from "../questionnaire-summary-card";

describe("QuestionnaireSummaryCard", () => {
  it("shows the title, pluralised count, and time estimate", () => {
    render(
      <QuestionnaireSummaryCard
        title="Burner profile"
        questionCount={8}
        estimatedMinutes={3}
      />,
    );
    expect(screen.getByText("Burner profile")).toBeTruthy();
    expect(screen.getByText(/8 questions/)).toBeTruthy();
    expect(screen.getByText(/about 3 min/)).toBeTruthy();
  });

  it("singularises a one-question questionnaire", () => {
    render(
      <QuestionnaireSummaryCard title="X" questionCount={1} estimatedMinutes={2} />,
    );
    expect(screen.getByText(/1 question(?!s)/)).toBeTruthy();
  });
});
