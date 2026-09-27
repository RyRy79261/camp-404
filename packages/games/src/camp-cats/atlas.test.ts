// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMP_CATS_COLOURS, MODA_FRAMES } from "./art";
import { atlasUrl, forgetAtlases } from "./atlas";

// jsdom has no canvas: a fake one whose picture is the list of colours it
// was painted in, and a computed style that answers the desktop's colours.
function fakeCanvas() {
  const fills = new Set<string>();
  const ctx = {
    fillStyle: "",
    fillRect() {
      fills.add(ctx.fillStyle);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ctx as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    () => `data:${[...fills].sort().join("|")}`,
  );
  return () => fills.clear();
}

let muted = "rgb(1, 1, 1)";
function desktopColours() {
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (el) =>
      ({
        color: (el as HTMLElement).style.color.includes("--os-muted")
          ? muted
          : "rgb(250, 250, 250)",
      }) as CSSStyleDeclaration,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  forgetAtlases();
  muted = "rgb(1, 1, 1)";
});

describe("a cat's strip picture", () => {
  it("is drawn once, then kept while the desktop's colours hold", () => {
    fakeCanvas();
    desktopColours();
    const draw = vi.mocked(HTMLCanvasElement.prototype.toDataURL);
    const first = atlasUrl(MODA_FRAMES, CAMP_CATS_COLOURS, document.body);
    expect(first).toContain("rgb(1, 1, 1)");
    expect(atlasUrl(MODA_FRAMES, CAMP_CATS_COLOURS, document.body)).toBe(first);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("is drawn anew in new colours when the desktop's colours change", () => {
    const clear = fakeCanvas();
    desktopColours();
    const first = atlasUrl(MODA_FRAMES, CAMP_CATS_COLOURS, document.body);
    muted = "rgb(9, 9, 9)";
    clear();
    const second = atlasUrl(MODA_FRAMES, CAMP_CATS_COLOURS, document.body);
    expect(second).not.toBe(first);
    expect(second).toContain("rgb(9, 9, 9)");
    expect(second).not.toContain("rgb(1, 1, 1)");
  });
});
