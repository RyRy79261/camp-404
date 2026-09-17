import {
  Questionnaire,
  type PageBlock,
  type Question,
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

// --- The unified model → the builder's shape (TEMPORARY) --------------------
// TEMPORARY: removed when the AB builder/runner UI lands.
//
// The server reads and writes only the unified model. The builder canvas, the
// member runner and the author preview still render `BuilderQuestionnaire`, so
// the pages that host them convert at that boundary — and nowhere else. A
// definition the old components cannot show (an intro page, `goTo` / `next`
// routing, one of AB's kinds or fields, an info block) converts to null, and
// the page says so rather than silently dropping what it cannot draw.

/** A value as canonical JSON: keys sorted, `undefined` members dropped. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/**
 * What `fromBuilderQuestionnaire` returns for a definition the builder CAN
 * show: the defaults the builder shape writes out (a title, a page type, an
 * image fit) filled in, and nothing else changed.
 */
function withBuilderDefaults(q: Questionnaire): Questionnaire {
  return {
    ...q,
    title: q.title ?? "",
    pages: q.pages.map((page) =>
      page.kind !== "questions"
        ? page
        : {
            ...page,
            pageType: page.pageType ?? "question",
            questions: page.questions.map((block) =>
              block.kind === "image_block"
                ? { ...block, sizeFit: block.sizeFit ?? "fit" }
                : block,
            ),
          },
    ),
  };
}

function toBuilderBlock(block: PageBlock): Block | null {
  switch (block.kind) {
    case "image_block": {
      const { url, alt, sizeFit, visibleIf, ...rest } = block;
      return {
        id: rest.id,
        kind: "image_block",
        imageUrl: url,
        ...(rest.caption !== undefined ? { caption: rest.caption } : {}),
        altText: alt,
        sizeFit: sizeFit ?? "fit",
        ...(visibleIf ? { visibleIf } : {}),
      };
    }
    case "info_block":
      return null;
    case "header_break":
    case "explainer":
    case "divider":
      return block;
    default: {
      const { visibleIf, ...question } = block;
      return {
        kind: "question",
        question: question as Question,
        ...(visibleIf ? { visibleIf } : {}),
      };
    }
  }
}

/**
 * The unified definition in the builder's older shape, or null when it uses
 * anything that shape cannot hold. The app no longer calls this: the builder,
 * runner and preview all read the unified model. It stays as the proof that
 * reading an old stored row loses nothing — the tests convert every stored
 * builder definition forward and back and require the identity. Exact by construction: the candidate is parsed as a builder definition
 * and converted back, and only a round trip that reproduces the input is
 * returned, so a field the builder would strip (AB's display modes, selection
 * bounds, option images, a numeric text format…) yields null instead of a
 * definition that quietly lost it. Every stored builder definition converts
 * (`fromBuilderQuestionnaire` then this is the identity).
 */
export function toBuilderQuestionnaire(
  q: Questionnaire,
): BuilderQuestionnaire | null {
  const pages: BuilderPage[] = [];
  for (const page of q.pages) {
    if (page.kind !== "questions") return null;
    const blocks: Block[] = [];
    for (const block of page.questions) {
      const converted = toBuilderBlock(block);
      if (!converted) return null;
      blocks.push(converted);
    }
    pages.push({
      id: page.id,
      type: page.pageType ?? "question",
      title: page.title,
      ...(page.subtitle !== undefined ? { intro: page.subtitle } : {}),
      ...(page.requiredToContinue !== undefined
        ? { requiredToContinue: page.requiredToContinue }
        : {}),
      blocks,
      ...(page.visibleIf ? { visibleIf: page.visibleIf } : {}),
    });
  }
  const parsed = BuilderQuestionnaire.safeParse({
    version: q.version,
    title: q.title ?? "",
    pages,
  });
  if (!parsed.success) return null;
  const roundTrip = fromBuilderQuestionnaire(parsed.data);
  return canonicalJson(roundTrip) === canonicalJson(withBuilderDefaults(q))
    ? parsed.data
    : null;
}
