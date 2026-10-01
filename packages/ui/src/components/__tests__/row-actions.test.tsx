import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RowActions } from "../row-actions";

afterEach(cleanup);

describe("RowActions", () => {
  it("puts the main action before a fixed-width slot of quiet ones", () => {
    const { container } = render(
      <RowActions
        label="Actions for Cooler boxes"
        primary={<button type="button">Pledge</button>}
        secondary={<button type="button">Edit</button>}
        secondarySlots={2}
      />,
    );
    const group = screen.getByRole("group", {
      name: "Actions for Cooler boxes",
    });
    expect(group.className).toContain("justify-end");
    const primary = container.querySelector(
      '[data-slot="row-actions-primary"]',
    )!;
    const secondary = container.querySelector(
      '[data-slot="row-actions-secondary"]',
    )!;
    expect(primary.nextElementSibling).toBe(secondary);
    expect(secondary.className).toContain("min-w-[5.125rem]");
  });

  it("keeps the quiet slot's width on a row that has none, so the main button stays put", () => {
    const { container } = render(
      <RowActions
        primary={<button type="button">Pledge</button>}
        secondary={null}
      />,
    );
    const secondary = container.querySelector(
      '[data-slot="row-actions-secondary"]',
    )!;
    expect(secondary).not.toBeNull();
    expect(secondary.className).toContain("min-w-10");
    expect(secondary.childElementCount).toBe(0);
  });

  it("draws no main slot when the row has no main action", () => {
    const { container } = render(
      <RowActions secondary={<button type="button">Edit</button>} />,
    );
    expect(
      container.querySelector('[data-slot="row-actions-primary"]'),
    ).toBeNull();
  });
});
