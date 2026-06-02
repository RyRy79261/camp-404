# Design tooling — pencil.dev

How Camp 404 drafts UI designs and turns them into code. This replaces the
ad-hoc "ask Claude to design something" workflow with a real design canvas
whose context flows to Claude through MCP — no lossy screenshot handoff.

See [`design-system.md`](design-system.md) for the `@camp404/ui` tokens and
components every mockup should target.

## What pencil.dev is

Pencil is an AI-native design canvas with two surfaces:

- **Desktop / IDE app + MCP server** — the main workflow. Designs live on an
  infinite canvas as `.pen` files (frames, layers, components, style guides).
  The installer auto-registers a **Pencil MCP server** with Claude Code.
  Claude calls MCP tools to read a frame and generate code in the target
  framework, respecting a chosen design system (shadcn is supported).
- **Headless CLI** — `@pencil.dev/cli` (npm, Node 18+). The same engine
  without a GUI: run the AI agent with a prompt, call MCP tools in an
  interactive shell, batch-process `.pen` files via `--tasks <json>`, and
  export to PNG/JPEG/WEBP/PDF. Requires `pencil login` first.

## Why this fits Camp 404

The README already commits to **shadcn/ui**. Pencil can target shadcn
directly, so generated code maps onto `@camp404/ui` components instead of
producing throwaway markup. The CLI also enables scripted mock exports for
review.

## Recommended workflow

1. Draft screens on the Pencil canvas (one frame per screen / state).
2. Claude reads the frame via the Pencil MCP server.
3. Claude generates components against `@camp404/ui` (see `design-system.md`).
4. A developer refines the result.

The CLI is used for batch mock exports when a GUI session isn't practical.

## The planning loop

A repo-level skill, `pencil-mockup` (`.claude/skills/pencil-mockup/`),
codifies this so it can be pulled into planning on demand:

1. While planning a feature, say **"use Pencil for the mockups"**.
2. The skill's workflow is folded into the feature plan — which `.pen` file,
   which frames, which `@camp404/ui` components to target.
3. You approve the plan.
4. Execution follows the skill: draft on the canvas → export a preview →
   generate code against `@camp404/ui`.

## Board → functional spec extraction

The Pencil canvas is the source of truth, but a `.pen` file is dense JSON. To make
it reviewable and to drive the board-derived functional spec, the repo ships a
deterministic extractor:

```bash
pnpm design:extract-boards          # node scripts/pencil/extract-boards.mjs design/app.pen design/.spec-extract
```

It reads `design/app.pen` and writes, for every top-level board, into
`design/.spec-extract/`:

- `boards/<NN>-<slug>.txt` — a readable, indented outline of the board (frames,
  text content, icons, layout props), with `ref` **component instances resolved**
  to their reusable component name + text overrides, and runs of identical
  siblings collapsed (`× N`).
- `boards-json/<NN>-<slug>.json` — the raw per-board JSON (for detail).
- `index.md` — a board inventory + a reverse map of which boards instantiate each
  reusable component.

This snapshot is what the **functional spec** under [`design/spec/`](../design/spec/README.md)
is built and cross-referenced against (see `design/spec/README.md`). The readable
outlines + `index.md` are committed as the spec's cited provenance; the bulky
`boards-json/` (a duplicate of `app.pen`) is gitignored — regenerate it any time
with the command above. Re-running after editing the canvas refreshes the
outlines; note that adding/removing boards shifts the `<NN>` index prefixes.

## Local setup (run on your machine)

Pencil needs a GUI and a Pencil account, so it cannot run in a headless
cloud sandbox — do this on your own machine:

1. `npm install -g @pencil.dev/cli`
2. `pencil login`
3. Install the Pencil desktop / IDE app.
4. In Claude Code, run `/mcp` and confirm `pencil` shows as connected.
5. Keep `.pen` source files in `design/` (see `design/README.md`) and commit
   them; exported assets under `design/exports/` are gitignored.

## `.mcp.json`

The repo ships a `.mcp.json` with a `pencil` MCP server entry so it
auto-connects where Pencil is installed. **The `command`/`args` are
install-specific** — the committed values are a placeholder. Verify and
replace them against your Pencil install (the desktop app's MCP bundle path,
or a `pencil mcp`-style CLI invocation) before relying on it.

## Caveats

- Pencil requires an account and runs locally only.
- The MCP server command is install-specific — always verify `.mcp.json`.
- Pencil is an early / free-tier tool: treat it as a drafting aid, not a
  source of truth. Hand-review all generated code.
