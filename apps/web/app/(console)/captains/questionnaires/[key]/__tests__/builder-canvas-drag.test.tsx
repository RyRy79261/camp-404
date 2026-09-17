import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";

// A block picked up with the keyboard shows a floating copy while it moves,
// and the copy goes when the move is cancelled.

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
  title: "Camp feedback",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "First",
      blocks: [
        {
          kind: "question",
          question: {
            id: "colour",
            kind: "short_text",
            prompt: "Favourite colour",
            maxLength: 120,
            required: false,
          },
        },
        { id: "note", kind: "explainer", bodyText: "Thanks!", style: "plain" },
      ],
    },
  ],
} as unknown as BuilderQuestionnaire;

describe("BuilderCanvas drag", () => {
  it("shows a floating copy of the block being moved", async () => {
    render(
      <BuilderCanvas
        questionnaireKey="feedback"
        definition={DEFINITION}
        canPublish={false}
        status="draft"
        publishedVersion={null}
        openActivationId={null}
      />,
    );
    const handle = screen.getByRole("button", {
      name: "Reorder Favourite colour",
    });
    expect(screen.getAllByText("Favourite colour")).toHaveLength(1);

    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await screen
      .findAllByText("Favourite colour")
      .then((found) => expect(found).toHaveLength(2));

    fireEvent.keyDown(handle, { key: "Escape", code: "Escape" });
    await vi.waitFor(() =>
      expect(screen.getAllByText("Favourite colour")).toHaveLength(1),
    );
  });
});
