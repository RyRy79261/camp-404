import { describe, expect, it } from "vitest";
import { findFullPrefetches } from "./prefetch-guard";

// Vite reads every source file in for the test, as text. (The package has no
// Node types, so no fs.)
declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>;
  }
}
const SOURCES = import.meta.glob(
  ["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}", "!./prefetch-guard.ts"],
  { query: "?raw", import: "default", eager: true },
);

const texts = (src: string) => findFullPrefetches(src).map((f) => f.text);

describe("findFullPrefetches", () => {
  it.each([
    ["router.prefetch", `router.prefetch("/tasks");`],
    ["a spaced call", `router . prefetch (url)`],
    ["prefetch={true}", `<Link href="/tasks" prefetch={true}>`],
    ["a bare prefetch", `<Link href="/tasks" prefetch>`],
    ["a bare prefetch closing the tag", `<Link href="/tasks" prefetch/>`],
    ["a computed value", `<Link href={u} prefetch={eager}>`],
    ["an options object", `router.push(u, { prefetch: true })`],
    ["a string that is not auto", `<Link prefetch="full">`],
  ])("finds %s", (_name, src) => {
    expect(findFullPrefetches(src)).toHaveLength(1);
  });

  it.each([
    ["the default link", `<Link href="/tasks">Tasks</Link>`],
    ["prefetch={false}", `<Link href="/tasks" prefetch={false}>`],
    ["prefetch={null}", `<Link href="/tasks" prefetch={null}>`],
    ["prefetch auto", `<Link href="/tasks" prefetch="auto">`],
    ["an options object with false", `f({ prefetch: false })`],
    ["a comment", `// never router.prefetch(url) or prefetch={true}`],
    ["a block comment", `/* prefetch={true}\n router.prefetch(x) */`],
    [
      "a sentence in a string",
      `const why = "a full prefetch marks things read";`,
    ],
    ["an optional type field", `type P = { prefetch?: boolean };`],
  ])("passes %s", (_name, src) => {
    expect(findFullPrefetches(src)).toEqual([]);
  });

  it("reports the line and the text", () => {
    expect(
      findFullPrefetches(
        `const a = 1;\n\n  <Link href="/x" prefetch={ true } />`,
      ),
    ).toEqual([{ line: 3, text: "prefetch={ true }" }]);
    expect(texts(`// ok\nrouter.prefetch("/a") // and a note`)).toEqual([
      ".prefetch(",
    ]);
  });
});

describe("the OS package itself", () => {
  it("never fully prefetches a program URL", () => {
    const files = Object.entries(SOURCES);
    expect(files.length).toBeGreaterThan(10);
    expect(files.map(([f]) => f)).toContain("./desktop-icons.tsx");
    const found = files.flatMap(([f, source]) =>
      findFullPrefetches(source).map((x) => `${f}:${x.line} ${x.text}`),
    );
    expect(found).toEqual([]);
  });
});
