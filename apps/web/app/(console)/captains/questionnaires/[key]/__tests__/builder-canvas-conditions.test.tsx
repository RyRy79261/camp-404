import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";

// The canvas shows which blocks and pages have a show-when rule, and flags one
// whose question is gone before the author tries to publish.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../actions", () => ({
  closeActivationAction: vi.fn(),
  getCarryOverAction: vi.fn(async () => ({ ok: true, carryOver: true })),
  publishAction: vi.fn(),
  setCarryOverAction: vi.fn(),
  unpublishAction: vi.fn(),
  updateDefinitionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BuilderCanvas } from "../builder-canvas";

afterEach(cleanup);

const DEFINITION = {
  version: "1",
  title: "Transport",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Getting there",
      blocks: [
        {
          kind: "question",
          question: {
            id: "drives",
            kind: "boolean",
            prompt: "Driving?",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "seats",
            kind: "number",
            prompt: "Spare seats",
            min: 0,
            max: 6,
            required: false,
          },
          visibleIf: { fieldId: "drives", op: "eq", value: true },
        },
        {
          kind: "question",
          question: {
            id: "plate",
            kind: "short_text",
            prompt: "Number plate",
            maxLength: 20,
            required: false,
          },
          visibleIf: { fieldId: "removed", op: "is_answered" },
        },
      ],
    },
    {
      id: "p2",
      type: "question",
      title: "Lift club",
      visibleIf: { fieldId: "drives", op: "eq", value: false },
      blocks: [
        {
          kind: "question",
          question: {
            id: "from",
            kind: "short_text",
            prompt: "Leaving from",
            maxLength: 80,
            required: false,
          },
        },
      ],
    },
  ],
} as unknown as BuilderQuestionnaire;

describe("BuilderCanvas conditions", () => {
  it("marks conditional blocks, flags a broken one, and describes a page's rule", () => {
    render(
      <BuilderCanvas
        questionnaireKey="transport"
        definition={DEFINITION}
        canPublish={false}
        status="draft"
        publishedVersion={null}
        openActivationId={null}
      />,
    );

    expect(screen.getByText("Conditional")).toBeTruthy();
    expect(screen.getByText(": Shown when “Driving?” is Yes.")).toBeTruthy();
    expect(screen.getByText("Fix condition")).toBeTruthy();
    expect(screen.getByText("Shown when “Driving?” is No.")).toBeTruthy();
  });

  it("shows what publish would refuse on the block and the page that have it", () => {
    render(
      <BuilderCanvas
        questionnaireKey="diet"
        definition={
          {
            version: "1",
            title: "Diet",
            pages: [
              {
                id: "p1",
                type: "question",
                title: "Food",
                blocks: [
                  {
                    kind: "question",
                    question: {
                      id: "diet",
                      kind: "single_select",
                      prompt: "Diet",
                      required: false,
                      options: [
                        { value: "veg", label: "Vegetarian" },
                        { value: "veg", label: "Vegan" },
                      ],
                    },
                  },
                ],
              },
              { id: "p2", type: "question", title: "Later", blocks: [] },
            ],
          } as unknown as BuilderQuestionnaire
        }
        canPublish={false}
        status="draft"
        publishedVersion={null}
        openActivationId={null}
      />,
    );

    // The server's publish check, so the canvas flags what publish refuses.
    expect(screen.getByText("Fix before publishing")).toBeTruthy();
    expect(screen.getByText(': duplicate option value "veg"')).toBeTruthy();
    expect(screen.getByText("Later has no blocks.")).toBeTruthy();
  });
});
