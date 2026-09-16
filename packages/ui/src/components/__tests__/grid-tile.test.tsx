import { cleanup, render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { GridTile } from "../grid-tile";

// A disabled tile that says nothing reads as broken. The reason is on the
// tile itself, because a phone has no hover for a title.

afterEach(cleanup);

describe("GridTile — disabled", () => {
  it("shows the reason on the tile and as its title", () => {
    const { container } = render(
      <GridTile
        icon={Users}
        title="My Teams"
        hint="Your crews"
        disabled
        disabledReason="Not built yet."
      />,
    );
    expect(screen.getByText("Not built yet.")).toBeTruthy();
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.getAttribute("aria-disabled")).toBe("true");
    expect(tile.getAttribute("title")).toBe("Not built yet.");
    expect(tile.tagName).toBe("DIV");
  });

  it("never shows a reason on a tile that works", () => {
    render(
      <GridTile
        icon={Users}
        title="My Teams"
        href="/teams"
        disabledReason="Not built yet."
      />,
    );
    expect(screen.queryByText("Not built yet.")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/teams");
  });
});
