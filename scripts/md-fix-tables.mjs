#!/usr/bin/env node
// Idempotent MD058 fixer: ensure exactly one blank line immediately before and
// after every pipe-table block in the given markdown files (never inside a table).
// Usage: node scripts/md-fix-tables.mjs <file> [<file> ...]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function expand(args) {
  const out = [];
  for (const a of args) {
    const st = statSync(a);
    if (st.isDirectory()) {
      for (const e of readdirSync(a, { recursive: true })) {
        if (typeof e === "string" && e.endsWith(".md")) out.push(join(a, e));
      }
    } else if (a.endsWith(".md")) out.push(a);
  }
  return out;
}

const isRow = (l) => /^\s*\|/.test(l);
let changed = 0;
for (const file of expand(process.argv.slice(2))) {
  const lines = readFileSync(file, "utf8").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const startsBlock = isRow(l) && (i === 0 || !isRow(lines[i - 1]));
    if (startsBlock && out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
    out.push(l);
    const endsBlock = isRow(l) && (i === lines.length - 1 || !isRow(lines[i + 1]));
    if (endsBlock && i + 1 < lines.length && lines[i + 1].trim() !== "") out.push("");
  }
  const next = out.join("\n");
  if (next !== lines.join("\n")) {
    writeFileSync(file, next);
    changed++;
  }
}
console.log(`md058: normalized ${changed} file(s)`);
