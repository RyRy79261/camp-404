import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Block } from "@camp404/types";

import { BlockCatalogDialog } from "../block-catalog-dialog";

afterEach(cleanup);

const INPUT_LABELS = [
  "Short text",
  "Long text",
  "Email",
  "Phone",
  "Number",
  "Scale / slider",
  "Single select",
  "Multi select",
  "Dropdown",
  "Date",
  "Yes / no",
  "Image upload",
];
const CONTENT_LABELS = ["Header break", "Explainer", "Image", "Divider"];

// A tile's accessible name includes its description, and "Image" is a prefix of
// "Image upload", so match the exact label-span text and click its button.
function pick(label: string): Block {
  const onSelect = vi.fn();
  render(
    <BlockCatalogDialog pageType="question" onSelect={onSelect} onClose={vi.fn()} />,
  );
  const button = screen.getByText(label, { exact: true }).closest("button");
  fireEvent.click(button!);
  expect(onSelect).toHaveBeenCalledTimes(1);
  return onSelect.mock.calls[0]![0] as Block;
}

describe("BlockCatalogDialog defaults", () => {
  // The catalog's make*() defaults must satisfy the Block schema, else inserting
  // one would corrupt the autosaved JSONB (BuilderQuestionnaire.safeParse fails).
  it.each(INPUT_LABELS)("input tile %s yields a parseable question block", (label) => {
    const parsed = Block.parse(pick(label));
    expect(parsed.kind).toBe("question");
    if (parsed.kind === "question") {
      expect(parsed.question.id.length).toBeGreaterThan(0);
    }
  });

  it.each(CONTENT_LABELS)("content tile %s yields a parseable content block", (label) => {
    const parsed = Block.parse(pick(label));
    expect(parsed.kind).not.toBe("question");
    if (parsed.kind !== "question") {
      expect(parsed.id.length).toBeGreaterThan(0);
    }
  });

  it("hides input fields on a content page", () => {
    render(
      <BlockCatalogDialog pageType="content" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText("Short text", { exact: true })).toBeNull();
    expect(screen.getByText("Divider", { exact: true })).toBeTruthy();
  });
});
