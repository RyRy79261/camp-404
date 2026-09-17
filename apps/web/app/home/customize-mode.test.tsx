import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomizeMode, dragAnnouncements } from "./customize-mode";
import { createCustomSection, seedLayout, sectionKey } from "./home-layout";
import { TILE_CATALOGUE } from "./tile-catalogue";
import { LAYOUT_CATALOGUE } from "./tile-lookup";

// Customize mode: a confirmed "Reset layout", and drag announcements that
// name tiles and groups rather than ids.

afterEach(cleanup);

const sections = seedLayout(LAYOUT_CATALOGUE, []).sections;
const captain = TILE_CATALOGUE[0]!;
const firstTile = captain.tiles[0]!;

describe("CustomizeMode", () => {
  it("resets the layout only after the member confirms", async () => {
    const onReset = vi.fn();
    render(
      <CustomizeMode
        sections={sections}
        setSections={vi.fn()}
        lockedGroupIds={[]}
        onDone={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Reset your layout\?/);
    expect(onReset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    await waitFor(() => expect(onReset).toHaveBeenCalledOnce());
  });
});

describe("dragAnnouncements", () => {
  it("names the tile and the group it is over", () => {
    const withCustom = createCustomSection(sections, "c1");
    const say = dragAnnouncements(withCustom);
    const active = { id: firstTile.id } as never;

    expect(say.onDragStart({ active })).toBe(`Picked up ${firstTile.title}.`);
    expect(say.onDragOver({ active, over: { id: "custom:c1" } as never })).toBe(
      `${firstTile.title} is over New group.`,
    );
    expect(
      say.onDragEnd({
        active,
        over: { id: sectionKey(withCustom[0]!) } as never,
      }),
    ).toBe(`Dropped ${firstTile.title} in ${captain.name}.`);
    expect(say.onDragCancel({ active, over: null })).toBe(
      `Stopped moving ${firstTile.title}. It is back where it was.`,
    );
  });
});
