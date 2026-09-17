import {
  Questionnaire,
  type PageBlock,
  type QuestionsPage,
} from "./questionnaire";
import {
  BuilderQuestionnaire,
  isBuilderDefinition,
  type Block,
  type BuilderPage,
} from "./questionnaire-builder";

// --- Stored definitions → the unified model ------------------------------
// Two definition shapes sit in `questionnaire_definitions` /
// `questionnaire_versions` JSONB, and neither is ever rewritten (a version
// snapshot is immutable):
//
//   1. the unified `Questionnaire` (pages of `kind: "questions" | "intro"`) —
//      the code-defined questionnaires and anything authored in it;
//   2. the builder's `BuilderQuestionnaire` (pages of `blocks`).
//
// Readers convert on the way OUT instead: `parseStoredDefinition` accepts
// either shape and always returns the unified one, so one runtime, one
// definition check and one results engine serve every stored row.
//
// The builder conversion is LOSSLESS — every builder field has a home:
//
//   builder                         unified
//   ------------------------------  ----------------------------------------
//   title                           title
//   page.type                       page.pageType ("question" | "content")
//   page.intro                      page.subtitle
//   page.requiredToContinue         page.requiredToContinue
//   page.visibleIf                  page.visibleIf
//   { kind: "question", question,   question, with the block's visibleIf on
//     visibleIf }                   the question itself
//   image_block imageUrl / altText  image_block url / alt (sizeFit kept)
//   header_break / explainer /      the same blocks, unchanged
//   divider
//
// `questionnaire-legacy.test.ts` (types) and the frozen builder fixture in
// @camp404/core prove it by converting back and comparing.

function fromBuilderBlock(block: Block): PageBlock {
  switch (block.kind) {
    case "question":
      return block.visibleIf
        ? { ...block.question, visibleIf: block.visibleIf }
        : block.question;
    case "image_block": {
      const { imageUrl, altText, ...rest } = block;
      // Key order mirrors the unified schema so a parse round-trips cleanly.
      return {
        id: rest.id,
        kind: "image_block",
        url: imageUrl,
        alt: altText,
        ...(rest.caption !== undefined ? { caption: rest.caption } : {}),
        sizeFit: rest.sizeFit,
        ...(rest.visibleIf ? { visibleIf: rest.visibleIf } : {}),
      };
    }
    case "header_break":
    case "explainer":
    case "divider":
      return block;
  }
}

function fromBuilderPage(page: BuilderPage): QuestionsPage {
  return {
    id: page.id,
    kind: "questions",
    title: page.title,
    ...(page.intro !== undefined ? { subtitle: page.intro } : {}),
    questions: page.blocks.map(fromBuilderBlock),
    ...(page.visibleIf ? { visibleIf: page.visibleIf } : {}),
    ...(page.requiredToContinue !== undefined
      ? { requiredToContinue: page.requiredToContinue }
      : {}),
    pageType: page.type,
  };
}

/**
 * Convert a builder definition into the unified model, losslessly: question
 * blocks unwrap (the block's `visibleIf` moves onto the question), content
 * pages become questions pages marked `pageType: "content"`, a page's `intro`
 * becomes its `subtitle`, and an image block's `imageUrl` / `altText` become
 * `url` / `alt`.
 */
export function fromBuilderQuestionnaire(
  def: BuilderQuestionnaire,
): Questionnaire {
  return {
    version: def.version,
    title: def.title,
    pages: def.pages.map(fromBuilderPage),
  };
}

/**
 * Read a stored definition of EITHER shape as the unified model. Throws (a
 * ZodError) when the JSON is neither a valid builder definition nor a valid
 * unified one — the same contract as `Questionnaire.parse`.
 */
export function parseStoredDefinition(json: unknown): Questionnaire {
  if (isBuilderDefinition(json)) {
    return fromBuilderQuestionnaire(BuilderQuestionnaire.parse(json));
  }
  return Questionnaire.parse(json);
}

/**
 * `parseStoredDefinition` for a read that must not throw: the unified
 * definition, or null when the stored JSON is malformed in either shape.
 */
export function safeParseStoredDefinition(json: unknown): Questionnaire | null {
  if (isBuilderDefinition(json)) {
    const parsed = BuilderQuestionnaire.safeParse(json);
    return parsed.success ? fromBuilderQuestionnaire(parsed.data) : null;
  }
  const parsed = Questionnaire.safeParse(json);
  return parsed.success ? parsed.data : null;
}
