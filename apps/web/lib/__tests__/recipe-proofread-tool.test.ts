import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// The source tool's schema is part of the pinned prompt (#243): Claude is
// asked for exactly this shape, and every run records the prompt version. So
// the schema is held to the version here. When SourceProofread (and the
// KitchenRecipe inside it, in @camp404/types) or the tool changes, this test
// fails until PROMPT_VERSIONS.recipeSource is bumped and the new version's
// fingerprint is added below. Never edit an old version's fingerprint: runs
// already stored under it were asked for that shape.

vi.mock("@/lib/anthropic", () => ({
  anthropic: vi.fn(),
  MODELS: { opus: "claude-opus-4-8", haiku: "claude-haiku-4-5-20251001" },
}));

import { PROMPT_VERSIONS } from "@camp404/ai-prompts";
import { PLATES_TOOL, SOURCE_TOOL } from "@/lib/recipe-proofread";

const BUMP =
  "The tool schema is part of the pinned prompt, so bump PROMPT_VERSIONS.recipeSource (packages/ai-prompts/src/index.ts) and add the new version's fingerprint here.";

/** sha256 of the tool as sent, per prompt version. */
const PINNED: Record<string, string> = {
  "2026-09-24.1":
    "7d0e15ff89f1c14ece609ebe57352fb7fe89b232c4644c653545c5ff940504f8",
  // The same tool: 2026-09-24.2 changed only the text (no pot size, no burners).
  "2026-09-24.2":
    "7d0e15ff89f1c14ece609ebe57352fb7fe89b232c4644c653545c5ff940504f8",
};

const fingerprint = () =>
  createHash("sha256").update(JSON.stringify(SOURCE_TOOL)).digest("hex");

describe("SOURCE_TOOL", () => {
  it("is built from SourceProofread, with no $schema key", () => {
    expect(SOURCE_TOOL.name).toBe("record_source_proofread");
    expect(SOURCE_TOOL.input_schema).not.toHaveProperty("$schema");
    expect(SOURCE_TOOL.input_schema.type).toBe("object");
    const schema = JSON.stringify(SOURCE_TOOL.input_schema);
    // Either questions, or the recipe with its report and scaling notes.
    for (const field of [
      "needsInfo",
      "questions",
      "recipe",
      "report",
      "scalingNotes",
    ]) {
      expect(schema).toContain(`"${field}"`);
    }
    // What Claude reads of the recipe: the Noble Notations field names.
    for (const field of ["plates", "ingredients", "steps", "uses", "notes"]) {
      expect(schema).toContain(`"${field}"`);
    }
    expect(schema).toContain("To serve: Rice");
    // Science is not in the contract, and neither are imperial units.
    expect(schema).not.toContain('"science"');
    expect(schema).not.toContain('"oz"');
  });

  it("matches the shape pinned for the current prompt version", () => {
    expect(fingerprint(), BUMP).toBe(PINNED[PROMPT_VERSIONS.recipeSource]);
  });
});

// The plate-count tool is pinned the same way, to PROMPT_VERSIONS.recipePlates:
// change PlateProofread or the tool and this fails until the version is
// bumped and its fingerprint added.

const PLATES_BUMP =
  "The plate-count tool schema is part of the pinned prompt, so bump PROMPT_VERSIONS.recipePlates (packages/ai-prompts/src/index.ts) and add the new version's fingerprint here.";

const PLATES_PINNED: Record<string, string> = {
  "2026-09-25.1":
    "469fb6c1266f3afb7c7ee7b039a061cd169870cc7ed3cedffb709cf10fc9f140",
  // pots no longer names the kitchen's largest pot or its size.
  "2026-09-25.2":
    "7c372fd3f0f8c45cf57dcfe5160fd6881e6332125d84c6fe478736432f6932cf",
};

const platesFingerprint = () =>
  createHash("sha256").update(JSON.stringify(PLATES_TOOL)).digest("hex");

describe("PLATES_TOOL", () => {
  it("is built from PlateProofread, with no $schema key and no science", () => {
    expect(PLATES_TOOL.name).toBe("record_plate_quantities");
    expect(PLATES_TOOL.input_schema).not.toHaveProperty("$schema");
    expect(PLATES_TOOL.input_schema.type).toBe("object");
    const schema = JSON.stringify(PLATES_TOOL.input_schema);
    for (const field of ["lines", "pots", "notes", "report", "unsure"]) {
      expect(schema).toContain(`"${field}"`);
    }
    // The kitchen's pot size and burners are not settings any more.
    expect(schema).not.toMatch(/largest pot|pot size|burner/i);
    expect(schema).not.toContain('"science"');
    expect(schema).not.toContain('"oz"');
  });

  it("matches the shape pinned for the current prompt version", () => {
    expect(platesFingerprint(), PLATES_BUMP).toBe(
      PLATES_PINNED[PROMPT_VERSIONS.recipePlates],
    );
  });
});
