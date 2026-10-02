import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The rail's tablist (#271, CodeRabbit review on #332): role="tab" buttons
// with no arrow-key navigation and no roving tabIndex is a tab widget that
// doesn't behave like one for a keyboard user. ArrowLeft/ArrowRight/Home/End
// move the choice and the focus together, and only the selected tab is a
// Tab stop.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/camp-layout/actions", () => ({
  saveLayoutAction: vi.fn(),
}));

import { emptyLayout } from "@camp404/core";
import { LayoutWorkspace } from "../layout-editor";

afterEach(cleanup);

function renderWorkspace() {
  render(
    <LayoutWorkspace
      initial={emptyLayout()}
      version={1}
      canEdit
      about={<div>About</div>}
      versions={<div>Versions panel</div>}
      arrivals={<div>Arrivals panel</div>}
      share={null}
      label="Camp layout"
    />,
  );
}

describe("LayoutWorkspace's rail tabs", () => {
  it("gives only the selected tab a Tab stop, the rest -1", () => {
    renderWorkspace();
    const piece = screen.getByRole("tab", { name: "Piece" });
    const versions = screen.getByRole("tab", { name: "Versions" });
    const arrivals = screen.getByRole("tab", { name: "Arrivals" });
    expect(piece.getAttribute("tabindex")).toBe("0");
    expect(versions.getAttribute("tabindex")).toBe("-1");
    expect(arrivals.getAttribute("tabindex")).toBe("-1");
  });

  it("ArrowRight moves the choice and the focus to the next tab, wrapping at the end", () => {
    renderWorkspace();
    const piece = screen.getByRole("tab", { name: "Piece" });
    const versions = screen.getByRole("tab", { name: "Versions" });
    const arrivals = screen.getByRole("tab", { name: "Arrivals" });
    piece.focus();
    fireEvent.keyDown(piece, { key: "ArrowRight" });
    expect(versions.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(versions);
    fireEvent.keyDown(versions, { key: "ArrowRight" });
    expect(arrivals.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(arrivals);
    // Wraps past the last tab back to the first.
    fireEvent.keyDown(arrivals, { key: "ArrowRight" });
    expect(piece.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(piece);
  });

  it("ArrowLeft wraps to the last tab, and Home/End jump to the ends", () => {
    renderWorkspace();
    const piece = screen.getByRole("tab", { name: "Piece" });
    const arrivals = screen.getByRole("tab", { name: "Arrivals" });
    piece.focus();
    fireEvent.keyDown(piece, { key: "ArrowLeft" });
    expect(arrivals.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(arrivals);
    fireEvent.keyDown(arrivals, { key: "Home" });
    expect(piece.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(piece);
    fireEvent.keyDown(piece, { key: "End" });
    expect(arrivals.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(arrivals);
  });
});
