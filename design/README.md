# design/

Source files for Camp 404's UI design work.

- **`*.pen`** — Pencil design files (the infinite-canvas source of truth for
  mockups). One file per feature, named `design/<feature>.pen`. **Commit
  these.**
- **`exports/`** — rendered previews (PNG/JPEG/PDF) generated from `.pen`
  files. **Gitignored** — regenerate from the `.pen` source instead.

See [`../docs/design-tooling.md`](../docs/design-tooling.md) for the
pencil.dev workflow and [`../docs/design-system.md`](../docs/design-system.md)
for the `@camp404/ui` tokens and components every mockup should target.
