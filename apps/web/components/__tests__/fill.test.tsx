import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Questionnaire } from "@camp404/types";

// The server action is a "use server" module; the fill wrapper only calls it,
// so a stub keeps the DB/server-only modules out of this render.
const save = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("@/app/(console)/questionnaires/[activationId]/actions", () => ({
  saveBuilderResponses: save,
}));

import { QuestionnaireFill } from "../questionnaire/fill";

const def = Questionnaire.parse({
  version: "1",
  title: "Kitchen shift",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Shifts",
      questions: [
        { id: "name", kind: "short_text", prompt: "Name", required: true },
      ],
    },
  ],
});

// Year namespace §9 — the one line a member sees when their prefilled answers
// were carried in from an earlier cycle. The loader has already forced
// completedAt to null on that row, so the member still has to submit; this
// line is the only thing that explains why the form isn't blank.
describe("QuestionnaireFill carry-over notice", () => {
  it("shows the carried-over line when the prefill came from an earlier cycle", () => {
    render(
      <QuestionnaireFill
        activationId="act-1"
        questionnaire={def}
        initialResponses={{ name: "Ada" }}
        seededFromPriorCycle
      />,
    );
    expect(
      screen.getByText(/answers from last year — check they're still right/i),
    ).toBeTruthy();
    // The prefill itself is still there — carry-over means amend, not retype.
    expect(screen.getByDisplayValue("Ada")).toBeTruthy();
  });

  it("shows nothing extra for a same-cycle prefill", () => {
    // A member resuming THIS year's half-finished form must not be told their
    // answers are last year's.
    render(
      <QuestionnaireFill
        activationId="act-1"
        questionnaire={def}
        initialResponses={{ name: "Ada" }}
      />,
    );
    expect(screen.queryByText(/from last year/i)).toBeNull();
  });

  it("shows nothing extra on a fresh, blank form", () => {
    render(
      <QuestionnaireFill
        activationId="act-1"
        questionnaire={def}
        initialResponses={{}}
      />,
    );
    expect(screen.queryByText(/from last year/i)).toBeNull();
  });
});

describe("QuestionnaireFill submit", () => {
  it("submits the answers to its own activation", async () => {
    render(
      <QuestionnaireFill
        activationId="act-1"
        questionnaire={def}
        initialResponses={{ name: "Ada" }}
        gate
      />,
    );
    // A gate counts answers rather than pages.
    expect(screen.getByText("1 of 1 answered")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("act-1", { name: "Ada" }, true),
    );
  });
});
