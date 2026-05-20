---
name: pencil-mockup
description: >-
  Draft UI mockups, designs, or visual prototypes for a Camp 404 feature with
  pencil.dev. Use when planning or building a feature and the user asks to
  "use Pencil for the mockups", create a mockup/design/wireframe, or visualise
  a screen before writing code. During planning, fold this workflow into the
  feature plan; during execution, follow its steps.
---

# Pencil mockup workflow

Drafts feature mockups on the pencil.dev canvas and turns them into code
against `@camp404/ui`. Background: `docs/design-tooling.md`.

## During planning

When the user says "use Pencil for the mockups", weave the steps below into
the feature plan — name the `.pen` file, list the frames (one per screen /
state), and list the `@camp404/ui` components each frame targets. Then let
the user approve the plan before doing any mockup work.

## Workflow

1. **Read `docs/design-system.md` first.** Mock against the `@camp404/ui`
   tokens and existing components — reuse components, keep the warm
   orange/red `--color-primary` as the only accent, never invent off-brand
   styles.
2. **Locate the `.pen` file.** Create or open `design/<feature>.pen`.
3. **Draft the mockup** via the Pencil MCP server (preferred) or the
   `@pencil.dev/cli` agent — one frame per screen or state.
4. **Export a preview.** Render a PNG to `design/exports/` and surface it for
   review.
5. **On approval, generate code** from the frame, mapped onto `@camp404/ui`
   components. Hand-review the output.

## Notes

- Pencil runs locally and needs a Pencil account + `pencil login`; it cannot
  run in a headless cloud sandbox.
- If the Pencil MCP server is unavailable (e.g. this sandbox — check `/mcp`
  for a connected `pencil` server), do **not** fake the mockup. Describe the
  intended frames in the plan instead and defer the `.pen` work to a local
  run.
- `design/exports/` is gitignored; commit only the `.pen` sources.
