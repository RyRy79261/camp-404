import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  PinnedAnnouncementBanner,
  PinnedAnnouncementScroller,
  PinnedAnnouncementSlot,
} from "../pinned-announcement-banner";

/** The scroller as the console draws it: N pins, in the order it was given. */
function Pins({ titles }: { titles: string[] }) {
  const single = titles.length === 1;
  return (
    <PinnedAnnouncementScroller count={titles.length}>
      {titles.map((title, i) => (
        <PinnedAnnouncementSlot key={title} single={single}>
          <PinnedAnnouncementBanner title={title} href={`/a/${i}`} />
        </PinnedAnnouncementSlot>
      ))}
    </PinnedAnnouncementScroller>
  );
}

describe("PinnedAnnouncementBanner", () => {
  it("shows the title and links to the announcement", () => {
    render(
      <PinnedAnnouncementBanner title="Burn-night briefing" href="/a/1" />,
    );
    expect(screen.getByText("Burn-night briefing")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Read/ });
    expect(link.getAttribute("href")).toBe("/a/1");
  });

  it("offers the reader no way to dismiss it — a captain unpins", () => {
    // Assert something PRESENT first, so the absence below cannot pass
    // against a component that never rendered.
    render(<PinnedAnnouncementBanner title="Water on the truck" href="/a/2" />);
    expect(screen.getByText("Water on the truck")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("merges className and forwards div attributes", () => {
    render(
      <PinnedAnnouncementBanner
        title="Pinned"
        href="/a/3"
        readLabel="Open"
        className="custom"
        data-testid="banner"
      />,
    );
    const el = screen.getByTestId("banner");
    expect(el.className).toContain("custom");
    expect(el.className).toContain("border-primary/30");
    expect(screen.getByRole("link", { name: /Open/ })).toBeTruthy();
  });
});

describe("PinnedAnnouncementScroller", () => {
  it("carries every pin, in the order it was handed them", () => {
    // The owner's ruling: none is dropped. Four pinned, four on the page.
    render(<Pins titles={["Fourth", "Third", "Second", "First"]} />);
    expect(screen.getAllByRole("link", { name: /Read/ })).toHaveLength(4);
    // The component does not re-order: the read already did, with the one
    // comparator. Reading the titles back in DOM order says so.
    const section = screen.getByRole("region", {
      name: "Pinned announcements",
    });
    const titles = Array.from(section.querySelectorAll("p"))
      .map((p) => p.textContent ?? "")
      .filter((t) => !t.includes("pinned"));
    expect(titles).toEqual(["Fourth", "Third", "Second", "First"]);
  });

  it("says how many there are, so an unscrolled pin is not a hidden one", () => {
    render(<Pins titles={["A", "B", "C"]} />);
    expect(screen.getByText(/3 pinned/)).toBeTruthy();
  });

  it("gives the track keyboard focus when there is something to scroll", () => {
    render(<Pins titles={["A", "B"]} />);
    const track = screen.getByRole("region", {
      name: /Pinned announcements, 2 in a row/,
    });
    expect(track.getAttribute("tabindex")).toBe("0");
    expect(track.className).toContain("overflow-x-auto");
  });

  it("draws one pin plainly: no count, no track to tab through", () => {
    render(<Pins titles={["Only one"]} />);
    // Something PRESENT first, so the absences below cannot pass against a
    // component that never rendered.
    expect(screen.getByText("Only one")).toBeTruthy();
    expect(screen.queryByText(/pinned/)).toBeNull();
    expect(screen.queryByRole("region", { name: /in a row/ })).toBeNull();
  });

  it("never offers the reader a dismiss, however many are pinned", () => {
    render(<Pins titles={["A", "B", "C"]} />);
    expect(screen.getAllByRole("link", { name: /Read/ })).toHaveLength(3);
    // Pinned means pinned: it comes down when a captain unpins it.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
