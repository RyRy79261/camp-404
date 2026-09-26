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

function sourceFiles(): string[] {
  return readdirSync(ROOT, { recursive: true, withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        /\.(ts|tsx|mts|js|mjs)$/.test(e.name) &&
        !/\.test\.ts$/.test(e.name) &&
        !path
          .join(e.parentPath, e.name)
          .includes(`${path.sep}node_modules${path.sep}`) &&
        !path
          .join(e.parentPath, e.name)
          .includes(`${path.sep}.next${path.sep}`),
    )
    .map((e) => path.join(e.parentPath, e.name));
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
