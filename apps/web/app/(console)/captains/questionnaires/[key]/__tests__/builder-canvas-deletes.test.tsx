import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";

// Every builder delete saves to the server at once and cannot be undone, so
// each one asks first: a block from its row, a page from its header.

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

import { updateDefinitionAction } from "../../actions";
import { BuilderCanvas } from "../builder-canvas";

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
      ],
    },
    { id: "p2", type: "question", title: "Second", blocks: [] },
  ],
} as unknown as BuilderQuestionnaire;

function renderCanvas() {
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
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("BuilderCanvas deletes", () => {
  it("asks before deleting a block, and deletes nothing on cancel", async () => {
    renderCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Favourite colour" }),
    );

    await screen.findByText("Delete “Favourite colour”?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText("Delete “Favourite colour”?")).toBeNull(),
    );
    expect(updateDefinitionAction).not.toHaveBeenCalled();
    expect(screen.getByText("Favourite colour")).toBeTruthy();
  });

  it("deletes the block once confirmed", async () => {
    renderCanvas();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Favourite colour" }),
    );
    await screen.findByText("Delete “Favourite colour”?");
    fireEvent.click(screen.getByRole("button", { name: "Delete block" }));

    await waitFor(() =>
      expect(updateDefinitionAction).toHaveBeenCalledTimes(1),
    );
    const saved = vi.mocked(updateDefinitionAction).mock
      .calls[0]![1] as BuilderQuestionnaire;
    expect(saved.pages[0]!.blocks).toEqual([]);
  });

  it("asks before deleting a page from its header", async () => {
    renderCanvas();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete page" })[0]!);

    await screen.findByText("Delete page 1?");
    expect(screen.getByText(/Its 1 block goes with it/)).toBeTruthy();
    expect(updateDefinitionAction).not.toHaveBeenCalled();
  });
});
