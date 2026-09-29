import { describe, expect, it } from "vitest";
import { Question } from "@camp404/types";
import {
  PALETTE_BY_KIND,
  blockPaletteKind,
  convertBlock,
  createBlock,
} from "../block-kinds";

// The two palette entries for the rating grid (#251).

describe("rating grid palette entries", () => {
  it("offers a rating grid and star ratings as questions", () => {
    expect(PALETTE_BY_KIND.rating_grid.group).toBe("question");
    expect(PALETTE_BY_KIND.star_ratings.group).toBe("question");
  });

  it("creates each as the rating_grid kind with its display", () => {
    const grid = createBlock("rating_grid", "q_1");
    const stars = createBlock("star_ratings", "q_2");
    expect(grid).toMatchObject({ kind: "rating_grid", display: "scale" });
    expect(stars).toMatchObject({ kind: "rating_grid", display: "stars" });
    expect(blockPaletteKind(grid)).toBe("rating_grid");
    expect(blockPaletteKind(stars)).toBe("star_ratings");
  });

  it("parses once the author has written the words", () => {
    const grid = createBlock("rating_grid", "q_1");
    const filled = {
      ...grid,
      prompt: "How true?",
      rows: [
        { id: "row_1", label: "Fair" },
        { id: "row_2", label: "Clear" },
      ],
    };
    expect(Question.safeParse(filled).success).toBe(true);
  });

  it("keeps the rows, id and leads-only mark when retyped to stars", () => {
    const grid = {
      ...createBlock("rating_grid", "q_1"),
      prompt: "Meals",
      leadsOnly: true,
      rows: [{ id: "meal_d1_dinner", label: "Day 1 dinner" }],
    };
    const stars = convertBlock(grid as never, "star_ratings");
    expect(stars).toMatchObject({
      id: "q_1",
      kind: "rating_grid",
      display: "stars",
      prompt: "Meals",
      leadsOnly: true,
      rows: [{ id: "meal_d1_dinner", label: "Day 1 dinner" }],
    });
  });
});
