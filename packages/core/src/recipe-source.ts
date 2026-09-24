import {
  SOURCE_SECTIONS,
  type RecipeSourceSections,
  type SourceBlock,
  type SourceDoc,
  type SourceInline,
  type SourceSection,
} from "@camp404/types";

// A recipe's source (#243, Kitchen): the Tiptap JSON the editor keeps, one
// document per section, and the Markdown-like text Claude reads. Markdown is
// only a typing shortcut in the editor; what is stored is the JSON, and the
// text is built from it here, the same way every time. Pure: no DB, no
// session, no next/*.

const SECTION_TITLES: Record<SourceSection, string> = {
  ingredients: "Ingredients",
  equipment: "Equipment",
  steps: "Steps",
  notes: "Notes",
};

function inlineText(content: readonly SourceInline[] | undefined): string {
  return (content ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      const marks = new Set((node.marks ?? []).map((m) => m.type));
      const wrap =
        marks.has("bold") && marks.has("italic")
          ? "***"
          : marks.has("bold")
            ? "**"
            : marks.has("italic")
              ? "*"
              : "";
      return `${wrap}${node.text}${wrap}`;
    })
    .join("");
}

/** A list item's lines, the first behind its marker, the rest indented. */
function itemLines(marker: string, blocks: readonly SourceBlock[]): string[] {
  const lines = blocks.flatMap(blockLines);
  const indent = " ".repeat(marker.length);
  if (lines.length === 0) return [marker.trimEnd()];
  return lines.map((line, i) => (i === 0 ? marker : indent) + line);
}

function blockLines(block: SourceBlock): string[] {
  switch (block.type) {
    case "paragraph": {
      const text = inlineText(block.content);
      return text.trim() ? text.split("\n") : [];
    }
    case "heading": {
      const text = inlineText(block.content).replace(/\n/g, " ").trim();
      return text ? [`### ${text}`] : [];
    }
    case "bulletList":
      return (block.content ?? []).flatMap((item) =>
        itemLines("- ", item.content ?? []),
      );
    case "orderedList": {
      const start = block.attrs?.start ?? 1;
      return (block.content ?? []).flatMap((item, i) =>
        itemLines(`${start + i}. `, item.content ?? []),
      );
    }
  }
}

/** One section's text, with no header; empty when it holds no words. */
export function sectionText(doc: SourceDoc): string {
  return (doc.content ?? []).flatMap(blockLines).join("\n").trim();
}

/**
 * The source as the text Claude reads: a "## Ingredients", "## Equipment",
 * "## Steps" or "## Notes" header over each section that has words, bullets
 * as "- ", numbered items as "1. ", bold as **x**, italic as *x*, a heading
 * inside a section as "### ", and a line break as a new line.
 */
export function sourceText(sections: RecipeSourceSections): string {
  return SOURCE_SECTIONS.map((key) => {
    const body = sectionText(sections[key]);
    return body ? `## ${SECTION_TITLES[key]}\n${body}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/** A section with nothing in it, as the editor starts one. */
export function emptySourceDoc(): SourceDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Four empty sections. */
export function emptySourceSections(): RecipeSourceSections {
  return {
    ingredients: emptySourceDoc(),
    equipment: emptySourceDoc(),
    steps: emptySourceDoc(),
    notes: emptySourceDoc(),
  };
}

/** A line that names a section, as pasted recipes usually write them. */
const SECTION_HEADING =
  /^\s*#*\s*(ingredients|equipment|you will need|method|steps|instructions|directions|notes|tips)\s*:?\s*$/i;

const HEADING_SECTION: Record<string, SourceSection> = {
  ingredients: "ingredients",
  equipment: "equipment",
  "you will need": "equipment",
  method: "steps",
  steps: "steps",
  instructions: "steps",
  directions: "steps",
  notes: "notes",
  tips: "notes",
};

const BULLET = /^\s*(?:[-*]\s+|•\s*)(.*)$/;

/**
 * Pasted text as sections. A line that looks like a section heading
 * ("Ingredients", "## Method", "Tips:") sends the lines after it to that
 * section; anything before the first one, and the whole text when there is
 * none, goes to Steps. Each non-empty line is a paragraph, and a run of lines
 * starting with "-", "*" or "•" is a bullet list.
 */
export function sourceFromText(text: string): RecipeSourceSections {
  const blocks: Record<SourceSection, SourceBlock[]> = {
    ingredients: [],
    equipment: [],
    steps: [],
    notes: [],
  };
  let section: SourceSection = "steps";
  for (const raw of text.split(/\r?\n/)) {
    const heading = SECTION_HEADING.exec(raw);
    if (heading) {
      section = HEADING_SECTION[heading[1]!.toLowerCase()]!;
      continue;
    }
    const line = raw.trim();
    if (!line) continue;
    const into = blocks[section];
    const bullet = BULLET.exec(raw);
    const bulletText = bullet?.[1]?.trim();
    if (bulletText) {
      const item = {
        type: "listItem" as const,
        content: [
          {
            type: "paragraph" as const,
            content: [{ type: "text" as const, text: bulletText }],
          },
        ],
      };
      const last = into[into.length - 1];
      if (last?.type === "bulletList")
        last.content = [...(last.content ?? []), item];
      else into.push({ type: "bulletList", content: [item] });
      continue;
    }
    into.push({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    });
  }
  const doc = (content: SourceBlock[]): SourceDoc =>
    content.length > 0 ? { type: "doc", content } : emptySourceDoc();
  return {
    ingredients: doc(blocks.ingredients),
    equipment: doc(blocks.equipment),
    steps: doc(blocks.steps),
    notes: doc(blocks.notes),
  };
}

/**
 * Deep equality for JSON values, blind to key order (Postgres jsonb reorders
 * keys) and to keys whose value is undefined (JSON leaves them out).
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = (r: Record<string, unknown>) =>
    Object.keys(r).filter((k) => r[k] !== undefined);
  const ka = keys(ra);
  if (ka.length !== keys(rb).length) return false;
  return ka.every((k) => Object.hasOwn(rb, k) && jsonEqual(ra[k], rb[k]));
}

/**
 * Whether two sources hold the same words: every section equal, whatever the
 * serves. Only a change to the words makes a reviewer the text's author (and
 * so its consent); a serves-only change leaves the member's words theirs.
 */
export function sameSections(
  a: RecipeSourceSections,
  b: RecipeSourceSections,
): boolean {
  return SOURCE_SECTIONS.every((key) => jsonEqual(a[key], b[key]));
}

/** Whether two sources say the same: the same serves and the same sections. */
export function sameSource(
  a: { serves: number | null; sections: RecipeSourceSections },
  b: { serves: number | null; sections: RecipeSourceSections },
): boolean {
  return a.serves === b.serves && sameSections(a.sections, b.sections);
}
