import { describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { parseStoredDefinition } from "@camp404/types";

import { BuilderPreview } from "../questionnaire/builder-preview";

vi.mock("next/navigation", () => ({ useParams: () => null }));

const def = parseStoredDefinition({
  version: "1",
  title: "Survey",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Only page",
      blocks: [
        { id: "h", kind: "header_break", headingText: "Welcome" },
        {
          kind: "question",
          question: {
            id: "name",
            kind: "short_text",
            prompt: "Name",
            required: false,
          },
        },
      ],
    },
  ],
});

describe("BuilderPreview", () => {
  it("renders the real runner from empty answers and finishes without persisting", async () => {
    const onComplete = vi.fn();
    render(<BuilderPreview questionnaire={def} onComplete={onComplete} />);

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeTruthy();
    // Single-page forms suppress the progress row (spec §5).
    expect(screen.queryByText("Page 1 of 1")).toBeNull();

    // No-op action: finishing a single-page preview just calls onComplete (the
    // submit runs in a transition, so wait for it).
    fireEvent.click(screen.getByRole("button", { name: "Finish preview" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("does not offer an upload for a required image, and lets the preview finish", async () => {
    cleanup();
    const onComplete = vi.fn();
    render(
      <BuilderPreview
        questionnaire={parseStoredDefinition({
          version: "1",
          title: "Photos",
          pages: [
            {
              id: "p1",
              type: "question",
              title: "Only page",
              blocks: [
                {
                  kind: "question",
                  question: {
                    id: "tent",
                    kind: "image",
                    prompt: "Your tent",
                    required: true,
                  },
                },
              ],
            },
          ],
        })}
        onComplete={onComplete}
      />,
    );

    expect(
      screen.getByText(
        "Uploads are off in the preview. Members can add a photo here.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish preview" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
