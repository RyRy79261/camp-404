import { readFileSync, readdirSync, statSync } from "node:fs";
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
// imports one, and every page that imports such a file, directly or through
// other modules.

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

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(WEB, spec.slice(2));
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

/** Each import statement's names and resolved file. */
function importsOf(file: string): { names: string[]; target: string }[] {
  const source = readFileSync(file, "utf8");
  const out: { names: string[]; target: string }[] = [];
  for (const m of source.matchAll(
    /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g,
  )) {
    const target = resolveImport(file, m[2]!);
    if (!target) continue;
    const names = [...m[1]!.matchAll(/[A-Za-z_$][\w$]*/g)].map((n) => n[0]);
    out.push({ names, target });
  }
  return out;
}

/** The exported actions whose body hands work to processRuns. */
function runStartingActions(): string[] {
  const source = readFileSync(ACTIONS, "utf8");
  const parts = source.split(/(?=^export async function )/m).slice(1);
  return parts
    .filter((part) => part.includes("processRuns("))
    .map((part) => /^export async function (\w+)/.exec(part)![1]!);
}

describe("pages that can start a Claude run", () => {
  const files = [
    ...sourceFiles(path.join(WEB, "app")),
    ...sourceFiles(path.join(WEB, "components")),
  ];
  const importers = new Map<string, Set<string>>();
  const seeds = new Set<string>();
  const actions = runStartingActions();
  for (const file of files) {
    for (const { names, target } of importsOf(file)) {
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target)!.add(file);
      if (target === ACTIONS && names.some((n) => actions.includes(n))) {
        seeds.add(file);
      }
    }
  }

  // Walk up from every file that calls such an action to the pages above it.
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
  const rel = (f: string) => path.relative(WEB, f);

  it("finds the actions and the pages (so the check is not empty)", () => {
    expect(actions).toContain("proofreadPlatesAction");
    expect(actions).toContain("runProofreadingAction");
    expect([...pages].map(rel)).toContain(
      "app/(console)/kitchen/meal-plan/page.tsx",
    );
  });

  it("gives every one of them the 300 s budget", () => {
    const missing = [...pages]
      .filter(
        (page) =>
          !/^export const maxDuration = 300;$/m.test(
            readFileSync(page, "utf8"),
          ),
      )
      .map(rel)
      .sort();
    expect(missing).toEqual([]);
  });
});
