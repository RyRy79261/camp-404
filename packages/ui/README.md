# @camp404/ui

Shared components built on shadcn/ui and Radix, and the design tokens.

- **Exports:** `@camp404/ui/components/<name>` (for example
  `@camp404/ui/components/page-heading`), `@camp404/ui/lib/utils`,
  `@camp404/ui/lib/form-logic` and `@camp404/ui/styles.css` (the tokens and the
  `page-sm:` … `page-xl:` window-width variants).
- **Depends on:** `@camp404/core`.
- **Imported by:** `apps/web`.

The tokens and components are described in
[`docs/design-system.md`](../../docs/design-system.md). Inside the console the
404 OS skin recolours them; see the Design section of
[`AGENTS.md`](../../AGENTS.md#design).

```bash
pnpm --filter @camp404/ui test
pnpm --filter @camp404/ui storybook
```
