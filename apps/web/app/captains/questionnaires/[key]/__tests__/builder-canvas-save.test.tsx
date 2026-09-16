import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";

// The footer says what autosave did: nothing on a fresh page, "All changes
// saved" after a save, and "Couldn't save" with a retry after a refusal.
// Before, it read "Saved" on first paint and after a rejected save.

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
  pages: [{ id: "p1", type: "question", title: "First", blocks: [] }],
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

describe("BuilderCanvas autosave status", () => {
  it("claims nothing before the first edit, then says the change is saved", async () => {
    renderCanvas();
    expect(screen.queryByText("All changes saved")).toBeNull();
    expect(screen.queryByText(/Saved/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add page" }));

    await screen.findByText("All changes saved");
  });

  it("says a refused save was not saved, and retries it", async () => {
    vi.mocked(updateDefinitionAction).mockResolvedValueOnce({
      ok: false,
      error: "Too big.",
    } as never);
    renderCanvas();

    fireEvent.click(screen.getByRole("button", { name: "Add page" }));
    await screen.findByText("Couldn't save.");
    // Rolled back: still one page.
    expect(
      screen.getAllByRole("button", { name: "Page settings" }),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("All changes saved");
    expect(updateDefinitionAction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateDefinitionAction).mock.calls[1]![1]).toEqual(
      vi.mocked(updateDefinitionAction).mock.calls[0]![1],
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Page settings" }),
      ).toHaveLength(2),
    );
  });

  it("adds an empty page right after this one from the Page break tile", async () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    fireEvent.click(await screen.findByText("Page break"));

    await screen.findByText("All changes saved");
    const saved = vi.mocked(updateDefinitionAction).mock
      .calls[0]![1] as BuilderQuestionnaire;
    expect(saved.pages.map((p) => p.blocks.length)).toEqual([0, 0]);
  });
});
