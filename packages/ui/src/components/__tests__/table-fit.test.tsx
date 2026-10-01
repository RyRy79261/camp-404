import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextFit, TableFit, type FitState } from "../table-fit";

afterEach(cleanup);

const fresh: FitState = { stacked: false, needed: null };

describe("nextFit", () => {
  it("leaves a table that fits alone", () => {
    expect(
      nextFit(fresh, { boxWidth: 830, tableVisible: true, overflow: 0 }),
    ).toEqual(fresh);
  });

  it("stacks a table wider than its box and remembers the width it needed", () => {
    expect(
      nextFit(fresh, { boxWidth: 868, tableVisible: true, overflow: 246 }),
    ).toEqual({ stacked: true, needed: 1114 });
  });

  it("ignores a one-pixel rounding overflow", () => {
    expect(
      nextFit(fresh, { boxWidth: 868, tableVisible: true, overflow: 1 }),
    ).toEqual(fresh);
  });

  it("keeps the cards until the box is as wide as the table needed", () => {
    const stacked: FitState = { stacked: true, needed: 1114 };
    expect(
      nextFit(stacked, { boxWidth: 1000, tableVisible: false, overflow: 0 }),
    ).toEqual(stacked);
    expect(
      nextFit(stacked, { boxWidth: 1114, tableVisible: false, overflow: 0 }),
    ).toEqual({ stacked: false, needed: 1114 });
  });
});

describe("TableFit", () => {
  let fire: () => void = () => {};
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderFit() {
    const { container } = render(
      <TableFit data-slot="responsive-data-table">
        <div data-rdt-layout="table">
          <div data-slot="table-container">
            <table />
          </div>
        </div>
      </TableFit>,
    );
    const root = container.firstElementChild as HTMLElement;
    const scroller = container.querySelector<HTMLElement>(
      '[data-slot="table-container"]',
    )!;
    return { root, scroller };
  }

  function size(el: HTMLElement, scrollWidth: number, clientWidth: number) {
    Object.defineProperty(el, "scrollWidth", {
      value: scrollWidth,
      configurable: true,
    });
    Object.defineProperty(el, "clientWidth", {
      value: clientWidth,
      configurable: true,
    });
    el.getClientRects = () => [{}] as unknown as DOMRectList;
  }

  it("draws the rows as cards when the table runs past its box", () => {
    const { root, scroller } = renderFit();
    expect(root.dataset.stacked).toBeUndefined();
    size(scroller, 1114, 868);
    Object.defineProperty(root, "clientWidth", {
      value: 868,
      configurable: true,
    });
    act(() => fire());
    expect(root.dataset.stacked).toBe("true");
  });

  it("leaves a table that fits as a table", () => {
    const { root, scroller } = renderFit();
    size(scroller, 800, 868);
    act(() => fire());
    expect(root.dataset.stacked).toBeUndefined();
  });
});
