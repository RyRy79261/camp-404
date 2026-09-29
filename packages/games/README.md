# @camp404/games

The desktop's toys: the INKBLOT game, the camp's cats and Shadow Work, the
camp's art piece. They take props and hold no app content.

- **Exports:** `@camp404/games/inkblot`, `/inkblot/art`, `/inkblot/styles.css`,
  `/cats`, `/cats/styles.css`, `/shadow-work`, `/characters`, `/camp-cats`.
- **Depends on:** `@camp404/os` for style order only.
- **Imported by:** `apps/web`, lazily, through
  `apps/web/components/os/desktop-cats.tsx`. `apps/join` may import only
  `@camp404/games/inkblot` and `@camp404/games/inkblot/art`
  (`apps/join/lib/games-boundary.test.ts` fails on anything else).
  `@camp404/os` never imports this package.
- **Rule:** the easter eggs are never named, hinted at or explained anywhere in
  the UI, and stay out of the Tab order. See the Design section of
  [`AGENTS.md`](../../AGENTS.md#design).

```bash
pnpm --filter @camp404/games test
```
