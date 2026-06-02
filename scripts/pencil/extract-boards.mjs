#!/usr/bin/env node
// Extract each top-level board from a .pen file into a readable outline + raw JSON,
// resolving `ref` component instances to their reusable component names and inlining
// text overrides. Produces an index with per-board reusable-component usage.
//
//   node scripts/pencil/extract-boards.mjs design/app.pen design/.spec-extract
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [, , penPath = "design/app.pen", outDir = "design/.spec-extract"] = process.argv;
const doc = JSON.parse(readFileSync(penPath, "utf8"));
const boards = doc.children || [];

// id -> node (global, for resolving refs), and reusable id -> name
const byId = new Map();
const reusable = new Map();
(function index(n) {
  if (n.id) byId.set(n.id, n);
  if (n.reusable) reusable.set(n.id, n.name || n.id);
  (n.children || []).forEach(index);
})({ children: boards });

const slug = (s) =>
  (s || "unnamed")
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

// Render a paint value (fill/stroke), which may be a token string, an image/
// shader/gradient object, or an array of layered paints — never "[object Object]".
const renderPaint = (p) => {
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (Array.isArray(p)) return p.map(renderPaint).join("+");
  if (typeof p === "object") {
    if (p.type === "image") return `image(${p.url ?? "?"})`;
    if (p.type === "shader") return `shader(${p.url ?? "?"})`;
    if (p.type === "gradient") return `gradient(${(p.stops || []).map((s) => s.color ?? s).join(",")})`;
    return `${p.type || "paint"}(…)`;
  }
  return String(p);
};

const layoutHints = (n) => {
  const h = [];
  if (n.layout) h.push(n.layout);
  if (n.width) h.push(`w:${n.width}`);
  if (n.height) h.push(`h:${n.height}`);
  if (n.gap != null) h.push(`gap:${n.gap}`);
  if (n.padding != null) h.push(`pad:${JSON.stringify(n.padding)}`);
  if (n.justifyContent) h.push(`jc:${n.justifyContent}`);
  if (n.alignItems) h.push(`ai:${n.alignItems}`);
  if (n.cornerRadius != null) h.push(`r:${n.cornerRadius}`);
  if (n.fill) h.push(`fill:${renderPaint(n.fill)}`);
  if (n.stroke) h.push(`stroke:${renderPaint(n.stroke)}`);
  if (n.layoutPosition === "absolute") h.push(`abs(${n.x},${n.y})`);
  if (n.opacity != null) h.push(`op:${n.opacity}`);
  return h.length ? ` {${h.join(" ")}}` : "";
};

const usage = new Map(); // boardSlug -> Set(componentName)

// Collapse consecutive identical sibling sub-outlines (e.g. decorative scanline runs)
function collapseRuns(lines) {
  const out = [];
  for (let i = 0; i < lines.length; ) {
    let j = i + 1;
    while (j < lines.length && lines[j] === lines[i]) j++;
    const n = j - i;
    out.push(n > 2 ? `${lines[i]}   × ${n}` : lines.slice(i, j).join("\n"));
    i = j;
  }
  return out;
}

function outline(n, depth, boardUsage, indentUnit = "  ") {
  const pad = indentUnit.repeat(depth);
  const nm = n.name ? ` "${n.name}"` : "";
  switch (n.type) {
    case "text": {
      const f = [n.fontFamily, n.fontSize && `${n.fontSize}px`, n.fontWeight, n.fill]
        .filter(Boolean)
        .join("/");
      return `${pad}T ${JSON.stringify(n.content ?? "")}  [${f}]`;
    }
    case "icon":
      return `${pad}⊙ ${n.icon}${n.fill ? ` (${n.fill})` : ""} [${n.library || "?"}]`;
    case "rectangle":
      return `${pad}▭${nm}${layoutHints(n)}`;
    case "ellipse":
      return `${pad}◯${nm}${layoutHints(n)}`;
    case "ref": {
      const compName = reusable.get(n.ref) || `?${n.ref}`;
      boardUsage.add(compName);
      let line = `${pad}⟶ <${compName}>${nm !== ` "${compName}"` ? nm : ""}${layoutHints(n)}`;
      const ov = n.descendants
        ? Object.values(n.descendants)
            .map((o) => o.content)
            .filter((c) => c != null)
        : [];
      if (ov.length) line += `  overrides:[${ov.map((c) => JSON.stringify(c)).join(", ")}]`;
      const kids = (n.children || []).map((c) => outline(c, depth + 1, boardUsage, indentUnit));
      return [line, ...kids].join("\n");
    }
    case "frame":
    default: {
      const head = `${pad}▸${nm}${layoutHints(n)}`;
      const kids = collapseRuns(
        (n.children || []).map((c) => outline(c, depth + 1, boardUsage, indentUnit))
      );
      return [head, ...kids].join("\n");
    }
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "boards"), { recursive: true });
mkdirSync(join(outDir, "boards-json"), { recursive: true });

const indexRows = [];
boards.forEach((b, i) => {
  const idx = String(i).padStart(2, "0");
  const name = b.name || `board-${i}`;
  const fileBase = `${idx}-${slug(name)}`;
  const boardUsage = new Set();
  const body = outline(b, 0, boardUsage);
  const kind = b.reusable ? "COMPONENT (reusable)" : "BOARD";
  const header = `# ${name}\n# kind: ${kind}  |  size: ${b.width ?? "-"}x${b.height ?? "-"}  |  pos: (${b.x ?? "-"},${b.y ?? "-"})\n# reusable components used: ${[...boardUsage].join(", ") || "none"}\n${"=".repeat(72)}\n`;
  writeFileSync(join(outDir, "boards", `${fileBase}.txt`), header + body + "\n");
  writeFileSync(join(outDir, "boards-json", `${fileBase}.json`), JSON.stringify(b, null, 1));
  usage.set(fileBase, boardUsage);
  indexRows.push({ idx, name, fileBase, kind, w: b.width, h: b.height, used: [...boardUsage] });
});

// index.md
let md = `# Board extraction index\n\nSource: \`${penPath}\` (pen v${doc.version}) — ${boards.length} top-level boards.\nReusable components: ${[...reusable.values()].join(", ")}\n\n| # | Name | Kind | Size | Reusable components used |\n|---|---|---|---|---|\n`;
for (const r of indexRows) {
  md += `| ${r.idx} | ${r.name} | ${r.kind.startsWith("COMP") ? "component" : "board"} | ${r.w ?? "-"}×${r.h ?? "-"} | ${r.used.join(", ") || "—"} |\n`;
}
// reverse usage: component -> boards using it
md += `\n## Reusable-component usage (where each is instantiated)\n\n`;
for (const cn of reusable.values()) {
  const users = indexRows.filter((r) => r.used.includes(cn)).map((r) => r.name);
  md += `- **${cn}** — used by ${users.length} board(s): ${users.join("; ") || "none"}\n`;
}
writeFileSync(join(outDir, "index.md"), md);
console.log(`Wrote ${boards.length} board outlines + JSON to ${outDir}/`);
console.log(`Index: ${join(outDir, "index.md")}`);
