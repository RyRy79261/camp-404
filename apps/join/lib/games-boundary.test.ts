import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Join depends on the whole @camp404/games package (and transpiles it), so
// nothing but review would stop a page here from importing the desktop's
// cats or Shadow Work. The owner's rule (AGENTS.md, Design): Join imports
// only INKBLOT, the game and its art. Anything else from the package is the
// camp app's, and is never drawn on the recruiting site.

const ROOT = path.join(__dirname, "..");
const ALLOWED = new Set([
  "@camp404/games/inkblot",
  "@camp404/games/inkblot/art",
]);

// Walk only Join's own source. `readdirSync(ROOT, { recursive: true })` went
// into node_modules too (pnpm's symlinks, ~35 000 entries, and .next after a
// build) and filtered it out afterwards, which ran past the 5 s test timeout
// on a busy CI runner. Skipped folders are never opened.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "coverage",
  "test-results",
  "playwright-report",
]);

function walk(dir: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, out);
    } else if (
      e.isFile() &&
      /\.(ts|tsx|mts|js|mjs)$/.test(e.name) &&
      !/\.test\.ts$/.test(e.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

let cached: string[] | undefined;
function sourceFiles(): string[] {
  cached ??= walk(ROOT, []);
  return cached;
}

/** Every "@camp404/games…" specifier a file imports, statically or lazily. */
function gamesSpecifiers(text: string): string[] {
  return [...text.matchAll(/["'](@camp404\/games(?:\/[^"']*)?)["']/g)].map(
    (m) => m[1]!,
  );
}

describe("Join's games boundary", () => {
  it("imports only INKBLOT from @camp404/games", () => {
    const found = sourceFiles().flatMap((file) =>
      gamesSpecifiers(readFileSync(file, "utf8"))
        .filter((spec) => !ALLOWED.has(spec))
        // next.config's transpilePackages names the package itself.
        .filter(
          (spec) =>
            !(spec === "@camp404/games" && file.endsWith("next.config.ts")),
        )
        .map((spec) => `${path.relative(ROOT, file)}: ${spec}`),
    );
    expect(found).toEqual([]);
  });

  it("finds the imports it is guarding (so a moved file cannot make it pass empty)", () => {
    const all = sourceFiles().flatMap((file) =>
      gamesSpecifiers(readFileSync(file, "utf8")),
    );
    expect(all).toContain("@camp404/games/inkblot");
    expect(all).toContain("@camp404/games/inkblot/art");
  });
});
