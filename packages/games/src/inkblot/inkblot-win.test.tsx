// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InkblotCopy } from "./copy";
import { InkblotWin } from "./inkblot-win";
import { BOARD_KEY, type Entry, type InkblotBoard } from "./leaderboard";

// The win screen's hall of fame, kept wherever the app says: the browser by
// default (Join), or a shared board the app hands in (the web desktop's, in
// its database).

const COPY: InkblotCopy = {
  title: "INKBLOT.EXE",
  tagline: "t",
  controls: "c",
  touch: "t",
  start: "s",
  winTitle: "GOODEST BOI",
  winLine: "w",
  boardNote: "n",
  againButton: "Again",
};

const run = (name: string, seconds: number): Entry => ({
  name,
  seconds,
  at: `2026-09-27T10:00:${String(seconds).padStart(2, "0")}.000Z`,
});

// jsdom draws no layout, so it has no element scrolling.
Element.prototype.scrollTo ??= () => {};

afterEach(() => window.localStorage.clear());

async function enter(initials: string) {
  fireEvent.change(await screen.findByLabelText(/Enter your initials/), {
    target: { value: initials },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("InkblotWin", () => {
  it("keeps the board in this browser when the app gives none", async () => {
    render(
      <InkblotWin copy={COPY} seconds={12.3} knocked={9} onAgain={() => {}} />,
    );
    await enter("jin");
    await screen.findByText("JIN");
    const stored = JSON.parse(window.localStorage.getItem(BOARD_KEY)!);
    expect(stored).toMatchObject([{ name: "JIN", seconds: 12.3 }]);
  });

  it("shows the shared board and saves the run to it, not the browser", async () => {
    const save = vi.fn<InkblotBoard["save"]>(async ({ name, seconds }) => {
      const mine = run(name, seconds);
      return { ok: true, board: [run("ABC", 10), mine], mine };
    });
    const board: InkblotBoard = {
      load: async () => [run("ABC", 10)],
      save,
    };
    render(
      <InkblotWin
        copy={COPY}
        seconds={15}
        knocked={9}
        board={board}
        onAgain={() => {}}
      />,
    );
    expect(await screen.findByText("ABC")).toBeTruthy();
    await enter("me");
    await screen.findByText("ME");
    expect(save).toHaveBeenCalledWith({ name: "ME", seconds: 15 });
    expect(window.localStorage.getItem(BOARD_KEY)).toBeNull();
  });

  it("says why when the shared board refuses the run, and keeps the form", async () => {
    const board: InkblotBoard = {
      load: async () => [],
      save: async () => ({ ok: false, error: "That time is too fast." }),
    };
    render(
      <InkblotWin
        copy={COPY}
        seconds={1}
        knocked={9}
        board={board}
        onAgain={() => {}}
      />,
    );
    await screen.findByText("No records yet.");
    await enter("me");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That time is too fast.",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("still lets the player save when the board could not be read", async () => {
    const board: InkblotBoard = {
      load: async () => {
        throw new Error("offline");
      },
      save: async () => ({ ok: false, error: "x" }),
    };
    render(
      <InkblotWin
        copy={COPY}
        seconds={20}
        knocked={9}
        board={board}
        onAgain={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "The hall of fame couldn't be loaded.",
      ),
    );
    expect(screen.getByLabelText(/Enter your initials/)).toBeTruthy();
  });
});
