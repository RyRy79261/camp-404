import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { JoinSiteContent } from "@camp404/types";
import { PerksSection } from "./sections";

// CodeRabbit (#333): each perk file's FieldCard used its array index as
// React's key. The words editor inside (MarkdownField -> MarkdownEditor)
// reads its starting text once, when it mounts, and never syncs to a later
// `value` prop change. Moving or deleting a file kept React's component
// instance at the same array index, so its editor kept showing the file that
// used to be there; the next keystroke then wrote that stale text into
// whichever file now sits at that index. A stable per-file key (not the
// array index) makes React mount a fresh editor for the file that's really
// there.

afterEach(cleanup);

function Harness({ initial }: { initial: JoinSiteContent["perks"] }) {
  const [value, setValue] = React.useState(initial);
  return <PerksSection value={value} set={setValue} />;
}

function perks(): JoinSiteContent["perks"] {
  return {
    summary: [],
    files: [
      { file: "ALPHA.TXT", name: "Alpha", paragraphs: ["Alpha words"] },
      { file: "BETA.TXT", name: "Beta", paragraphs: ["Beta words"] },
    ],
  };
}

async function editors() {
  const found = await waitFor(() => {
    const boxes = screen.getAllByRole("textbox", { name: /^Words:/ });
    expect(boxes).toHaveLength(2);
    return boxes;
  });
  return found;
}

describe("PerksSection's file editors", () => {
  it("shows each file's own words, Alpha first and Beta second", async () => {
    render(<Harness initial={perks()} />);
    const [first, second] = await editors();
    expect(first!.textContent).toContain("Alpha words");
    expect(second!.textContent).toContain("Beta words");
  });

  it("keeps each file's own words after Beta moves up, ahead of Alpha", async () => {
    render(<Harness initial={perks()} />);
    await editors();
    const menu = screen.getByRole("button", {
      name: "Beta: move or delete",
    });
    await act(async () => {
      fireEvent.keyDown(menu, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));
    });

    // Beta is now first, so its editor must show "Beta words" there, not
    // the "Alpha words" its slot used to hold.
    const [first, second] = await editors();
    expect(first!.textContent).toContain("Beta words");
    expect(first!.textContent).not.toContain("Alpha words");
    expect(second!.textContent).toContain("Alpha words");
    expect(second!.textContent).not.toContain("Beta words");
  });

  it("keeps Beta's own words after Alpha is deleted", async () => {
    render(<Harness initial={perks()} />);
    await editors();
    const menu = screen.getByRole("button", {
      name: "Alpha: move or delete",
    });
    await act(async () => {
      fireEvent.keyDown(menu, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    });

    const only = await waitFor(() => {
      const boxes = screen.getAllByRole("textbox", { name: /^Words:/ });
      expect(boxes).toHaveLength(1);
      return boxes[0]!;
    });
    expect(only.textContent).toContain("Beta words");
    expect(only.textContent).not.toContain("Alpha words");
  });
});
