import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetPortrait } from "./pet-portrait";

describe("PetPortrait", () => {
  it("renders a crisp, hidden-from-readers SVG of rects on the server", () => {
    const html = renderToStaticMarkup(<PetPortrait moduleKey="prince" />);
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-pet-portrait="prince"');
    expect(html.match(/<rect /g)?.length ?? 0).toBeGreaterThan(10);
  });

  it("renders nothing for a key with no picture", () => {
    expect(renderToStaticMarkup(<PetPortrait moduleKey="biscuit" />)).toBe("");
  });
});
