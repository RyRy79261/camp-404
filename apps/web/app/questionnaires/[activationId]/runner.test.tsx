import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuilderQuestionnaire } from "@camp404/types";

// The server action is a "use server" module; the runner only binds it, so a
// stub keeps the DB/server-only modules out of this render.
vi.mock("./actions", () => ({ saveBuilderResponses: vi.fn() }));

import { BuilderRunner } from "./runner";

// Year namespace §9 — the one line a member sees when their prefilled answers
// were carried in from an earlier cycle. The loader has already forced
// completedAt to null on that row, so the member still has to press Finish;
// this line is the only thing that explains why the form isn't blank.

const def = BuilderQuestionnaire.parse({
  version: "1",
  title: "Kitchen shift",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Shifts",
      blocks: [
        {
          kind: "question",
          question: { id: "name", kind: "short_text", prompt: "Name", required: true },
        },
      ],
    },
  ],
});

describe("BuilderRunner carry-over notice", () => {
  it("shows the carried-over line when the prefill came from an earlier cycle", () => {
    render(
      <BuilderRunner
        activationId="act-1"
        definition={def}
        initialResponses={{ name: "Ada" }}
        seededFromPriorCycle
        title="Kitchen shift"
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
      <BuilderRunner
        activationId="act-1"
        definition={def}
        initialResponses={{ name: "Ada" }}
        title="Kitchen shift"
      />,
    );

    expect(screen.queryByText(/from last year/i)).toBeNull();
  });

  it("shows nothing extra on a fresh, blank form", () => {
    render(
      <BuilderRunner
        activationId="act-1"
        definition={def}
        initialResponses={{}}
        title="Kitchen shift"
      />,
    );

    expect(screen.queryByText(/from last year/i)).toBeNull();
  });
});
