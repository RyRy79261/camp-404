import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// What keeps the heavy editor and Markdown code out of pages that only show
// words (review PR 4: components-2, performance-2). Neither typecheck nor lint
// notices when a page starts shipping them again, and a build's chunk sizes
// are not checked in CI, so the import lines that matter are pinned here.

const WEB = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

function sources(dir: string): string[] {
  return readdirSync(join(WEB, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(join(WEB, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the editor stays out of read-only pages", () => {
  it("takes MarkdownBody from @camp404/ui, never the composers' client module", () => {
    // components/announcements/markdown-body.tsx is "use client": a server
    // page importing the renderer through it sends react-markdown and the
    // remark/rehype stack to the browser for words already drawn on the server.
    const offenders = [...sources("app"), ...sources("components")].filter(
      (path) =>
        /import\s*\{[^}]*\bMarkdownBody\b[^}]*\}\s*from\s*"@\/components\/announcements\/markdown-body"/.test(
          read(path),
        ),
    );
    expect(offenders.map((p) => relative(WEB, join(WEB, p)))).toEqual([]);
    expect(read("components/announcements/markdown-body.tsx")).not.toMatch(
      /export\s*\{\s*MarkdownBody\s*\}/,
    );
  });

  it("loads the WYSIWYG editor lazily from MarkdownField", () => {
    const field = read("components/markdown/markdown-field.tsx");
    expect(field).not.toMatch(
      /^import[^;]*from\s*"@\/components\/guide\/markdown-editor"/m,
    );
    expect(field).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\("@\/components\/guide\/markdown-editor"\)/,
    );
  });

  it("keeps Tiptap's runtime out of the paragraph helpers readers use", () => {
    // Only a type may come from Tiptap here: About, the join-site preview and
    // every MarkdownField's preview read paragraphs through this file.
    const runtime = read("components/markdown/paragraph-text.ts")
      .split("\n")
      .filter((line) => /^import\s+(?!type\b).*@tiptap/.test(line));
    expect(runtime).toEqual([]);
  });

  it("keeps the music note's editor out of the Lounge's other buttons", () => {
    expect(read("components/lounge/lounge-controls.tsx")).not.toMatch(
      /markdown-field|markdown-editor|MusicNoteButton/,
    );
  });
});
