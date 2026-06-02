#!/usr/bin/env node
// Deterministic assembler for the totalistic feature-set brief.
// Globs design/feature-set/*.md (unit files only — NOT the verification/ subdir),
// sorts by numeric filename prefix, prepends a banner + master header, and
// concatenates the units verbatim with a fixed separator. Idempotent &
// regenerable: edit the unit files, then re-run `node scripts/assemble-feature-set.mjs`.
// Never hand-edit the output (design/design-feature-set.md).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "design/feature-set";
const OUT = "design/design-feature-set.md";
const SEP = "\n\n---\n\n";
const BANNER =
  "<!-- AUTO-ASSEMBLED from design/feature-set/*.md. Regenerate by re-running scripts/assemble-feature-set.mjs. Do not hand-edit. -->";

const files = readdirSync(DIR)
  .filter((f) => /^\d+.*\.md$/.test(f)) // unit files only (NN-*.md); ignores verification/ subdir
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10)); // numeric prefix order: 00, 01, … NN

if (files.length === 0) {
  console.error(`No unit files matched ${DIR}/NN-*.md — nothing to assemble.`);
  process.exit(1);
}

const header = [
  BANNER,
  "",
  "# Camp 404 — Totalistic Design Feature-Set Brief",
  "",
  `**Assembled:** ${new Date().toISOString().slice(0, 10)}  ·  **Status:** generated build artifact (do not hand-edit)`,
  "",
  "**How to read:** treat every feature / action / state / enum / value below as a requirement to PRESERVE in any redesign — restyle freely, but DROP NO FUNCTIONALITY. Edit the per-unit sources in design/feature-set/, then re-run scripts/assemble-feature-set.mjs. See design/feature-set-verification-report.md for the adversarial accuracy audit.",
].join("\n");

const body = files.map((f) => readFileSync(join(DIR, f), "utf8").trimEnd()).join(SEP);
writeFileSync(OUT, header + SEP + body + "\n");
console.log(`assembled ${files.length} unit files → ${OUT}`);
