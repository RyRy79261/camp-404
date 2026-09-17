import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCustomSection, moveTile, seedLayout } from "./home-layout";
import { LAYOUT_CATALOGUE } from "./tile-lookup";
import { useHomeLayout } from "./use-home-layout";

// The layout hook: ready once the saved layout is in, and a reset that puts
// the default back and saves it.

const KEY = "camp404:home-layout:v2";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("useHomeLayout", () => {
  it("is ready after the saved layout is applied", async () => {
    const saved = moveTile(
      createCustomSection(
        seedLayout(LAYOUT_CATALOGUE, []).sections,
        "c1",
        "Favourites",
      ),
      LAYOUT_CATALOGUE[0]!.tiles[0]!.id,
      "custom:c1",
    );
    localStorage.setItem(KEY, JSON.stringify({ v: 2, sections: saved }));

    const { result } = renderHook(() => useHomeLayout(LAYOUT_CATALOGUE, []));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(
      result.current.sections.some(
        (s) => s.kind === "custom" && s.title === "Favourites",
      ),
    ).toBe(true);
  });

  it("resets to the default and saves it", async () => {
    const saved = moveTile(
      createCustomSection(
        seedLayout(LAYOUT_CATALOGUE, []).sections,
        "c1",
        "Favourites",
      ),
      LAYOUT_CATALOGUE[0]!.tiles[0]!.id,
      "custom:c1",
    );
    localStorage.setItem(KEY, JSON.stringify({ v: 2, sections: saved }));
    const { result } = renderHook(() => useHomeLayout(LAYOUT_CATALOGUE, []));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.reset());

    const seed = seedLayout(LAYOUT_CATALOGUE, []).sections;
    expect(result.current.sections).toEqual(seed);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      v: 2,
      sections: seed,
    });
  });
});
