import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Skeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonPage,
  SkeletonRegion,
  SkeletonTable,
  SkeletonText,
} from "../skeleton";

// The accessibility contract is the whole point of this kit: exactly one
// `.sr-only` label per loading region, every decorative bar `aria-hidden`, and
// the pulse behind `motion-safe:`.
describe("Skeleton", () => {
  it("marks the bar aria-hidden and keeps the pulse motion-safe", () => {
    const { container } = render(<Skeleton />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.className).toContain("motion-safe:animate-pulse");
    // ...and never the bare, unguarded variant.
    expect(bar.className).not.toMatch(/(^|\s)animate-pulse/);
  });

  it("merges className verbatim so callers can size it", () => {
    const { container } = render(<Skeleton className="h-24 w-24" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("h-24");
    expect(bar.className).toContain("w-24");
    expect(bar.className).toContain("rounded-md"); // base classes preserved
  });

  it("draws one bar per text line, all hidden from the reader", () => {
    const { container } = render(<SkeletonText lines={4} />);
    const bars = container.querySelectorAll("[aria-hidden]");
    expect(bars).toHaveLength(4);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(0);
  });
});

describe("SkeletonRegion", () => {
  it("announces itself once with a polite status label", () => {
    render(
      <SkeletonRegion>
        <Skeleton />
      </SkeletonRegion>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.querySelectorAll(".sr-only")).toHaveLength(1);
    expect(screen.getByText("Loading…").className).toContain("sr-only");
  });

  it("takes a caller label and className", () => {
    render(<SkeletonRegion label="Loading roster…" className="custom" />);
    const region = screen.getByRole("status");
    expect(region.className).toBe("custom");
    expect(screen.getByText("Loading roster…")).toBeTruthy();
  });
});

describe("composed skeletons", () => {
  it.each([
    ["card", () => <SkeletonCard />, "Loading card…"],
    ["list", () => <SkeletonList />, "Loading list…"],
    ["table", () => <SkeletonTable />, "Loading table…"],
    ["page", () => <SkeletonPage />, "Loading page…"],
  ] as const)("gives %s exactly one sr-only label", (_name, node, label) => {
    const { container } = render(node());
    const labels = container.querySelectorAll(".sr-only");
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe(label);
  });

  it("hides every bar in a region from the reader", () => {
    const { container } = render(<SkeletonList rows={3} />);
    // Three rows × (avatar + name bar + trailing bar).
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(9);
  });

  it("keeps one label per region when regions sit side by side", () => {
    const { container } = render(
      <div>
        <SkeletonCard />
        <SkeletonList rows={1} />
      </div>,
    );
    expect(container.querySelectorAll("[role='status']")).toHaveLength(2);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(2);
  });

  it("sizes the table grid from rows and columns", () => {
    const { container } = render(<SkeletonTable rows={2} columns={3} />);
    // One header strip of 3 + two body rows of 3.
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(9);
  });
});
