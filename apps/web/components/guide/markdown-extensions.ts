import { Node, type Editor, type JSONContent } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { findWrapping } from "@tiptap/pm/transform";
import { StarterKit } from "@tiptap/starter-kit";
import {
  CODE_FENCE,
  GUIDE_SITE_HOST,
  MEMBERS_ONLY_CLOSE,
  MEMBERS_ONLY_OPEN,
} from "@camp404/types";

// What the WYSIWYG Markdown editor can write, one list per kind of text,
// shared by the editor and its round-trip test. Only what Markdown and the
// reader's renderer (MarkdownBody) both carry: headings, bold, italic, bullet
// and numbered lists, links, quotes and line breaks. Code, strike-through and
// rules are not on the toolbar, but the editor still reads and writes them:
// text typed into the old textareas ("Markdown works") may hold them, and an
// editor that dropped them would save the loss over the stored note on the
// next keystroke. Underline has no Markdown, so it stays off. Tiptap's own
// Markdown extension reads the stored Markdown in and writes it back out; the
// text is kept as Markdown, as before.
//
// A Survival Guide chapter (#250's public site) can also hold "Members only"
// parts: the `membersOnly` node below, stored as a `:::members … :::` fence.
// It goes only into the chapter's list; meeting notes have no public site.

const STARTER = {
  // The toolbar offers levels 2 and 3; level 1 is kept so text
  // written with "# " elsewhere reads back unchanged.
  heading: { levels: [1, 2, 3] as (1 | 2 | 3)[] },
  underline: false as const,
  link: {
    openOnClick: false,
    autolink: true,
    defaultProtocol: "https",
    protocols: ["http", "https", "mailto"],
  },
};

/** Meeting notes, and anywhere else long Markdown is written. */
export const NOTES_EDITOR_EXTENSIONS = [
  StarterKit.configure(STARTER),
  Markdown,
];

/** The tag drawn on a Members only part in the editor. */
export const MEMBERS_ONLY_TAG = "Members only";
export const MEMBERS_ONLY_WHY = `Not on ${GUIDE_SITE_HOST}`;

/**
 * The end of a `:::members` part at the start of `src`: the index just past
 * its closing `:::` line, or -1 when it has none. The same reading as the
 * server's (splitMembersOnly in @camp404/core): only a bare `:::` line
 * outside a code block closes it.
 */
export function membersPartEnd(src: string): number {
  const lines = src.split("\n");
  if (lines[0] !== MEMBERS_ONLY_OPEN) return -1;
  let offset = lines[0].length + 1;
  let fence: string | null = null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    const end = offset + line.length;
    if (fence !== null) {
      if (
        new RegExp(`^ {0,3}\\${fence[0]}{${fence.length},}\\s*$`).test(line)
      ) {
        fence = null;
      }
    } else {
      const code = CODE_FENCE.exec(line);
      if (code) fence = code[1]!;
      else if (line === MEMBERS_ONLY_CLOSE)
        return Math.min(end + 1, src.length);
    }
    offset = end + 1;
  }
  return -1;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    membersOnly: {
      /**
       * Wrap the selected top-level blocks in a Members only part, or, inside
       * one, unwrap the whole part.
       */
      toggleMembersOnly: () => ReturnType;
    };
  }
}

/**
 * A "Members only" part of a chapter: one or more blocks members read in the
 * app and the public site never gets. Only the document's top level may hold
 * one (its own group, which a list or a quote does not accept), and one never
 * holds another.
 */
export const MembersOnly = Node.create({
  name: "membersOnly",
  group: "membersOnlyBlock",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-members-only]" }];
  },

  renderHTML() {
    return [
      "div",
      {
        "data-members-only": "",
        "data-tag": MEMBERS_ONLY_TAG,
        "data-why": MEMBERS_ONLY_WHY,
        "aria-label": `${MEMBERS_ONLY_TAG}. ${MEMBERS_ONLY_WHY}.`,
        role: "group",
      },
      0,
    ];
  },

  markdownTokenizer: {
    name: "membersOnly",
    level: "block",
    start(src: string) {
      const index = src.match(/^:::members$/m)?.index;
      return index ?? -1;
    },
    tokenize(src, _tokens, lexer) {
      const end = membersPartEnd(src);
      if (end < 0) return undefined;
      const raw = src.slice(0, end);
      const inner = raw
        .slice(MEMBERS_ONLY_OPEN.length + 1)
        .replace(/(^|\n):::\n?$/, "");
      const tokens = lexer.blockTokens(inner);
      return { type: "membersOnly", raw, tokens };
    },
  },

  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      "membersOnly",
      {},
      content.length > 0 ? content : [{ type: "paragraph" }],
    );
  },

  renderMarkdown(node: JSONContent, helpers) {
    const inner = helpers.renderChildren(node.content ?? [], "\n\n").trimEnd();
    return `${MEMBERS_ONLY_OPEN}\n${inner}\n${MEMBERS_ONLY_CLOSE}`;
  },

  addCommands() {
    return {
      toggleMembersOnly:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from, $to } = state.selection;
          // Inside a part: put its blocks back where it was.
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth);
            if (node.type.name === this.name) {
              if (dispatch) {
                const start = $from.before(depth);
                tr.replaceWith(start, start + node.nodeSize, node.content);
                dispatch(tr.scrollIntoView());
              }
              return true;
            }
          }
          // Otherwise wrap the top-level blocks the selection touches.
          const range = $from.blockRange(
            $to,
            (node) => node.type === state.schema.topNodeType,
          );
          if (!range) return false;
          const wrapping = findWrapping(range, this.type);
          if (!wrapping) return false;
          if (dispatch) dispatch(tr.wrap(range, wrapping).scrollIntoView());
          return true;
        },
    };
  },
});

/**
 * A chapter's document: blocks, and Members only parts between them. Tiptap's
 * own Document node with one more group allowed at the top level.
 */
const ChapterDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "(block | membersOnlyBlock)+",
  renderMarkdown: (node: JSONContent, helpers) =>
    node.content ? helpers.renderChildren(node.content, "\n\n") : "",
});

/** A Survival Guide chapter: the notes' set plus Members only parts. */
export const CHAPTER_EDITOR_EXTENSIONS = [
  StarterKit.configure({ ...STARTER, document: false }),
  ChapterDocument,
  MembersOnly,
  Markdown,
];

/**
 * The editor's text as Markdown, without the empty lines Tiptap keeps after a
 * heading or a list at the end (its trailing paragraph), so the text does not
 * end in blank lines nobody typed.
 */
export function editorMarkdown(editor: Editor): string {
  return editor.getMarkdown().replace(/\s+$/, "");
}

/** The editor's "paragraphs" mode (components/markdown/paragraph-text.ts):
 * paragraphs with bold and italic, and nothing the join site cannot show. */
export const PARAGRAPH_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    hardBreak: false,
    strike: false,
    underline: false,
    link: false,
  }),
];
