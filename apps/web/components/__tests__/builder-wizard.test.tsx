import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BuilderQuestionnaire } from "@camp404/types";

import { BuilderWizard } from "../questionnaire/builder-wizard";

const def = BuilderQuestionnaire.parse({
  version: "1",
  title: "Survey",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "About you",
      blocks: [
        { id: "h", kind: "header_break", headingText: "Tell us about you" },
        {
          kind: "question",
          question: { id: "name", kind: "short_text", prompt: "Name", required: true },
        },
      ],
    },
    {
      id: "p2",
      type: "question",
      title: "Leadership",
      blocks: [
        {
          kind: "question",
          question: { id: "lead", kind: "boolean", prompt: "Lead a team?", required: false },
        },
        {
          kind: "question",
          question: { id: "team", kind: "short_text", prompt: "Which team?", required: true },
          visibleIf: { fieldId: "lead", op: "eq", value: true },
        },
      ],
    },
  ],
});

function renderWizard(action = vi.fn(async () => ({ ok: true as const }))) {
  render(
    <BuilderWizard
      questionnaire={def}
      initialResponses={{}}
      action={action}
      persistProgress={false}
      variant="onboarding"
      submitLabel="Finish"
    />,
  );
  return action;
}

describe("BuilderWizard", () => {
  it("renders content + question blocks and counts visible pages", () => {
    renderWizard();
    expect(screen.getByRole("heading", { name: "Tell us about you" })).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });

  it("blocks Continue on a missing required field, then advances when filled", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("This question is required")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy(); // still page 1

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getByText("Lead a team?")).toBeTruthy();
  });

  it("skips a required field hidden by visibleIf, so the form can finish", () => {
    const action = renderWizard();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // `team` is required but hidden (lead ≠ true), so it must not block submit.
    expect(screen.queryByText("Which team?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(action).toHaveBeenCalledWith({ name: "Ada" }, true);
  });
});

describe("BuilderWizard — persisted saves (persistProgress)", () => {
  function renderPersisting(action: () => Promise<unknown>) {
    render(
      <BuilderWizard
        questionnaire={def}
        initialResponses={{ name: "Ada" }}
        action={action as never}
        persistProgress
        variant="onboarding"
        submitLabel="Finish"
      />,
    );
  }

  it("surfaces a server validation error and stays on the page", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      errors: { name: "Server says no" },
    }));
    renderPersisting(action);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByText("Server says no")).toBeTruthy());
    expect(action).toHaveBeenCalledWith({ name: "Ada" }, false);
    expect(screen.getByText("Page 1 of 2")).toBeTruthy(); // did not advance
  });

  it("shows a form-level error when the save action throws", async () => {
    const action = vi.fn(async () => {
      throw new Error("boom");
    });
    renderPersisting(action);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't save your answers/i)).toBeTruthy(),
    );
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });
});
