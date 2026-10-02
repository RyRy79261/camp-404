import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The neighbour page (#271): public, no sign-in, and nothing typed inside the
// camp on it (no label, no road name). It takes only what getSharedLayout returns, so the real
// guarantee is neighbourView (core) and getSharedLayout (PGlite); this checks
// the page answers 404 for a dead link and draws what it is given, and never
// asks who is signed in.

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/camp-layout", () => ({ getSharedLayout: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() => {
    throw new Error("the neighbour page must not read a session");
  }),
}));

import { getSharedLayout } from "@/lib/camp-layout";
import NeighbourPage from "./page";

const TOKEN = "a".repeat(32);

afterEach(cleanup);

async function renderFor(token: string) {
  render(await NeighbourPage({ params: Promise.resolve({ token }) }));
}

describe("the neighbour page", () => {
  it("answers 404 for a link that is off", async () => {
    vi.mocked(getSharedLayout).mockResolvedValue(null);
    await expect(renderFor(TOKEN)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("draws the plan by kind and the arrivals as counts", async () => {
    vi.mocked(getSharedLayout).mockResolvedValue({
      cycle: 2027,
      layout: {
        plot: { widthM: 28, depthM: 60, north: "top", part: "left" },
        pieces: [
          { kind: "kitchen", x: 1, y: 1, w: 8, h: 6 },
          { kind: "tent", x: 20, y: 10, w: 3, h: 2.5 },
          { kind: "tent", x: 25, y: 10, w: 3, h: 2.5 },
        ],
      },
      arrivals: [
        { day: "2027-04-23", count: 4 },
        { day: "2027-04-26", count: 11 },
      ],
    });
    await renderFor(TOKEN);
    expect(
      screen.getByRole("img", { name: /Camp 404's site plan/ }),
    ).toBeTruthy();
    // The key is by kind: Kitchen is 1 and Tent 2, the number each wears.
    const legend = screen.getByRole("list", { name: "What's on the plan" });
    const rows = [...legend.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toEqual(["1Kitchen×1", "2Tent×2"]);
    const arrivals = screen.getByRole("list", { name: "Arrivals by day" });
    expect(arrivals.textContent).toContain("Fri 23 Apr");
    expect(arrivals.textContent).toContain("11");
    expect(screen.getByText(/people arriving/).textContent).toContain("15");
    expect(
      screen.getByText(/We're on the left half of the block/),
    ).toBeTruthy();
    // No road is named: the camp types those, and none leaves it.
    expect(document.body.textContent).not.toMatch(/ROAD/);
  });
});
