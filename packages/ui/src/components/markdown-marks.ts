// The three marks About Camp 404 uses that Markdown has no sign for, so its
// words keep the Notion page's look (Caitlin, 2026-11-15: "if something is
// highlighted or in a different colour, it is in a similar format"):
//
//   ==words==   highlighted          → <mark>
//   {{words}}   in the accent colour → <span class="md-accent">
//   ++words++   underlined           → <u>
//
// Only MarkdownBody's `marks` reads them; everywhere else they are the
// characters they were typed as. A mark may run across bold and italic
// ("==**ALL HANDS** set up day=="), and bold may hold one. It must open and
// close inside one paragraph (or heading, or list line); an opener with no
// partner stays as typed. They nest: an inner mark closes before its outer
// one ("**==++AT LEAST ONE team.++==**"). Code is never read for marks.
// The tags are on MarkdownBody's allow-list, and nothing a writer types can
// add an attribute: the class comes from here.

/** Just enough of mdast, as in markdown-body.tsx. */
export interface MarkNode {
  type: string;
  value?: string;
  children?: MarkNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

type Kind = "mark" | "accent" | "underline";

const OPEN: Record<string, Kind> = {
  "==": "mark",
  "{{": "accent",
  "++": "underline",
};
const CLOSE: Record<string, Kind> = {
  "==": "mark",
  "}}": "accent",
  "++": "underline",
};
const SIGN: Record<Kind, [string, string]> = {
  mark: ["==", "=="],
  accent: ["{{", "}}"],
  underline: ["++", "++"],
};
const SPLIT = /(==|\{\{|\}\}|\+\+)/;

/** The class the accent colour is drawn with (MarkdownBody's prose). */
export const ACCENT_CLASS = "md-accent";

function element(kind: Kind, children: MarkNode[]): MarkNode {
  return {
    // An unknown mdast type with an hName becomes that element
    // (mdast-util-to-hast's applyData), carrying its children.
    type: "campMark",
    data:
      kind === "mark"
        ? { hName: "mark" }
        : kind === "underline"
          ? { hName: "u" }
          : { hName: "span", hProperties: { className: [ACCENT_CLASS] } },
    children,
  };
}

/** Text nodes next to each other become one. */
function mergeText(nodes: MarkNode[]): MarkNode[] {
  const out: MarkNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.type === "text" && last?.type === "text") {
      last.value = (last.value ?? "") + (n.value ?? "");
    } else {
      out.push(n.type === "text" ? { ...n } : n);
    }
  }
  return out.filter((n) => n.type !== "text" || (n.value ?? "") !== "");
}

type Frame = { kind: Kind | null; children: MarkNode[] };

/** Read the marks in one run of inline nodes (a paragraph's, a bold's). */
export function applyMarks(children: readonly MarkNode[]): MarkNode[] {
  const stack: Frame[] = [{ kind: null, children: [] }];
  const top = () => stack[stack.length - 1]!;
  for (const child of children) {
    if (child.type !== "text") {
      top().children.push(child);
      continue;
    }
    for (const piece of (child.value ?? "").split(SPLIT)) {
      if (piece === "") continue;
      const closes = CLOSE[piece];
      if (closes && top().kind === closes) {
        const frame = stack.pop()!;
        top().children.push(element(closes, mergeText(frame.children)));
        continue;
      }
      const opens = OPEN[piece];
      if (opens && !stack.some((f) => f.kind === opens)) {
        stack.push({ kind: opens, children: [] });
        continue;
      }
      top().children.push({ type: "text", value: piece });
    }
  }
  // An opener with no partner goes back to the characters it was typed as.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    top().children.push(
      { type: "text", value: SIGN[frame.kind!][0] },
      ...frame.children,
    );
  }
  return mergeText(top().children);
}

/** The nodes whose children are inline text a writer marks. */
const INLINE_PARENTS = new Set([
  "paragraph",
  "heading",
  "strong",
  "emphasis",
  "link",
  "tableCell",
]);

function walk(node: MarkNode): void {
  if (!node.children) return;
  for (const child of node.children) walk(child);
  if (INLINE_PARENTS.has(node.type)) node.children = applyMarks(node.children);
}

/** The remark plugin MarkdownBody's `marks` turns on. */
export function remarkCampMarks() {
  return (tree: MarkNode) => walk(tree);
}
