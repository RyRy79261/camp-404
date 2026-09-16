import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuilderPage } from "@camp404/types";
import { PageSettingsDialog } from "../page-settings-dialog";

// Switching a page to "content" keeps its questions, but publish refuses a
// content page that still holds one. The dialog says so before the save.

afterEach(cleanup);

function pageWith(questions: number): BuilderPage {
  return {
    id: "p1",
    type: "question",
    title: "About you",
    blocks: Array.from({ length: questions }, (_, i) => ({
      kind: "question",
      question: {
        id: `q${i}`,
        kind: "short_text",
        prompt: `Question ${i}`,
        maxLength: 120,
        required: false,
      },
    })),
  } as BuilderPage;
}

function renderDialog(page: BuilderPage) {
  render(
    <PageSettingsDialog
      page={page}
      canDelete
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("PageSettingsDialog — page type", () => {
  it("warns, naming the count, when a page with questions becomes a content page", () => {
    renderDialog(pageWith(2));
    expect(screen.queryByText(/still has/)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Content page" }));

    expect(screen.getByText(/This page still has 2 questions\./)).toBeTruthy();
  });

  it("says nothing for an empty page", () => {
    renderDialog(pageWith(0));
    fireEvent.click(screen.getByRole("radio", { name: "Content page" }));
    expect(screen.queryByText(/still has/)).toBeNull();
  });

  it("drops the warning when the page goes back to a question page", () => {
    renderDialog(pageWith(1));
    fireEvent.click(screen.getByRole("radio", { name: "Content page" }));
    expect(screen.getByText(/This page still has 1 question\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Question page" }));
    expect(screen.queryByText(/still has/)).toBeNull();
  });
});
