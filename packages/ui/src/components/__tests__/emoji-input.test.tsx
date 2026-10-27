import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Input } from "../input";
import { Textarea } from "../textarea";

// Every text box offers emoji (owner, 2026-10-27): the ☺ button opens the
// panel, and `:name` opens a row of matches. A controlled box's onChange sees
// what goes in, as if it were typed.

afterEach(cleanup);
beforeEach(() => localStorage.clear());

function Controlled({ start = "" }: { start?: string }) {
  const [value, setValue] = React.useState(start);
  return (
    <>
      <Input
        aria-label="Title"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <output aria-label="Saved">{value}</output>
    </>
  );
}

describe("Input with emoji", () => {
  it("has the ☺ button in a plain text box, and none where it does not belong", () => {
    render(
      <>
        <Input aria-label="Plain" />
        <Input aria-label="Email" type="email" />
        <Input aria-label="Code" emoji={false} />
        <Input aria-label="Name" autoComplete="name" />
        <Textarea aria-label="Notes" />
      </>,
    );
    expect(screen.getAllByRole("button", { name: "Emoji" })).toHaveLength(2);
  });

  it("puts a picked emoji into a controlled box through its onChange", async () => {
    render(<Controlled start="Build " />);
    const box = screen.getByRole("textbox", { name: "Title" });
    (box as HTMLInputElement).setSelectionRange(6, 6);
    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    const search = await screen.findByRole("searchbox", {
      name: "Search emoji",
    });
    fireEvent.change(search, { target: { value: "fire" } });
    fireEvent.click(await screen.findByRole("button", { name: "fire" }));
    expect(screen.getByRole("status", { name: "Saved" }).textContent).toBe(
      "Build 🔥",
    );
    // It is remembered for the Recent row.
    expect(localStorage.getItem("camp404:emoji-recent")).toBe('["🔥"]');
  });

  it("opens the :name row while typing, and Enter puts the first match in", async () => {
    render(<Controlled />);
    const box = screen.getByRole("textbox", { name: "Title" });
    box.focus();
    fireEvent.input(box, { target: { value: "Hot :fire" } });
    fireEvent.change(box, { target: { value: "Hot :fire" } });
    (box as HTMLInputElement).setSelectionRange(9, 9);
    fireEvent.input(box);
    await screen.findByRole("button", { name: "fire", pressed: true });
    act(() => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Saved" }).textContent).toBe(
        "Hot 🔥",
      ),
    );
  });
});
