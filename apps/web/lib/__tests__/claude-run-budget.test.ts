import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A Claude run started by a recipe action runs in after(), which lives only
// as long as the function that served the action: the page the member is on.
// So every page that can start one must export `maxDuration = 300`, or Vercel
// stops the run at its default limit, after Claude has been paid for
// (web-console-a-4: the meal plan's plate chips did, without it).
// PROOFREAD_TIMEOUT_MS (lib/recipe-proofread.ts) assumes the 300 s.
//
// A static check: it reads the files and runs none of them. It finds the
// actions in the recipes' actions file that call processRuns, every file that
// imports one, and every page that reaches such a file, directly or through
// other modules (imports, re-exports and import()).

const WEB = path.resolve(__dirname, "../..");
const ACTIONS = path.join(WEB, "app/(console)/kitchen/recipes/actions.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "node_modules" || name === "__tests__"
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function resolveImport(root: string, from: string, spec: string) {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

/** Every name a module takes from another, or "*" for all of it. */
const ALL = "*";

/**
 * Each module another one reaches, with the names it takes: static imports,
 * re-exports (`export { a } from`, `export * from`), and dynamic `import()`.
 */
function importsOf(
  root: string,
  file: string,
): { names: string[]; target: string }[] {
  const source = readFileSync(file, "utf8");
  const out: { names: string[]; target: string }[] = [];
  const add = (clause: string | null, spec: string) => {
    const target = resolveImport(root, file, spec);
    if (!target) return;
    const names =
      clause === null || /\*/.test(clause)
        ? [ALL]
        : [...clause.matchAll(/[A-Za-z_$][\w$]*/g)].map((n) => n[0]);
    out.push({ names, target });
  };
  for (const m of source.matchAll(
    /(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g,
  )) {
    add(m[1]!, m[2]!);
  }
  for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    add(null, m[1]!);
  }
  return out;
}

/** The exported actions whose body hands work to processRuns. */
function runStartingActions(actionsFile: string): string[] {
  const source = readFileSync(actionsFile, "utf8");
  return source
    .split(/(?=^export async function )/m)
    .filter((part) => part.startsWith("export async function "))
    .filter((part) => part.includes("processRuns("))
    .map((part) => /^export async function (\w+)/.exec(part)![1]!);
}

/**
 * Every page that reaches a run-starting action: the files that take one
 * from the actions file, then everything that reaches those, up to the pages.
 */
function pagesThatStartRuns(
  root: string,
  dirs: string[],
  actionsFile: string,
): { actions: string[]; pages: string[] } {
  const files = dirs.flatMap((dir) => sourceFiles(path.join(root, dir)));
  const actions = runStartingActions(actionsFile);
  const importers = new Map<string, Set<string>>();
  const seeds = new Set<string>();
  for (const file of files) {
    for (const { names, target } of importsOf(root, file)) {
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target)!.add(file);
      if (
        target === actionsFile &&
        names.some((n) => n === ALL || actions.includes(n))
      ) {
        seeds.add(file);
      }
    }
  }
  const pages = new Set<string>();
  const seen = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const file = queue.pop()!;
    if (/[/\\](page|layout)\.tsx$/.test(file)) pages.add(file);
    for (const parent of importers.get(file) ?? []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return {
    actions,
    pages: [...pages].map((f) => path.relative(root, f)).sort(),
  };
}

describe("the walk from an action to its pages", () => {
  it("follows imports, re-exports and import()", () => {
    const root = mkdtempSync(path.join(tmpdir(), "claude-run-budget-"));
    const write = (rel: string, text: string) => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    };
    try {
      write(
        "app/actions.ts",
        "export async function runAction() { after(() => processRuns()); }\n" +
          "export async function quietAction() {}\n",
      );
      // A barrel that re-exports the action, and one that re-exports it all.
      write("app/barrel.ts", 'export { runAction } from "./actions";\n');
      write("app/star.ts", 'export * from "./actions";\n');
      write(
        "app/via-barrel/page.tsx",
        'import { runAction } from "../barrel";\n',
      );
      write("app/via-star/page.tsx", 'import { runAction } from "../star";\n');
      // A component loaded with import(), which reaches the action.
      write("app/button.tsx", 'import { runAction } from "@/app/actions";\n');
      write(
        "app/lazy/page.tsx",
        'const B = lazy(() => import("../button"));\n',
      );
      // Takes only an action that starts nothing.
      write(
        "app/quiet/page.tsx",
        'import { quietAction } from "../actions";\n',
      );

      expect(
        pagesThatStartRuns(root, ["app"], path.join(root, "app/actions.ts")),
      ).toEqual({
        actions: ["runAction"],
        pages: [
          "app/lazy/page.tsx",
          "app/via-barrel/page.tsx",
          "app/via-star/page.tsx",
        ],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pages that can start a Claude run", () => {
  const { actions, pages } = pagesThatStartRuns(
    WEB,
    ["app", "components"],
    ACTIONS,
  );

  it("finds the actions and the pages (so the check is not empty)", () => {
    expect(actions).toContain("proofreadPlatesAction");
    expect(actions).toContain("runProofreadingAction");
    expect(pages).toContain("app/(console)/kitchen/meal-plan/page.tsx");
  });

  it("gives every one of them the 300 s budget", () => {
    const missing = pages.filter(
      (page) =>
        !/^export const maxDuration = 300;$/m.test(
          readFileSync(path.join(WEB, page), "utf8"),
        ),
    );
    expect(missing).toEqual([]);
  });
});
