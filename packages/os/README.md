# @camp404/os

The 404 OS window engine: the desktop surface, windows, the window manager,
the taskbar, the Start menu, folders, the Today gadget, the blocking layer, the
terminal and the "last seen" copies of background windows.

- **Exports:** `@camp404/os` (the engine and its parts),
  `@camp404/os/terminal`, `@camp404/os/prefetch-guard` (a test helper that
  finds a full prefetch of a program URL) and `@camp404/os/styles.css`.
- **Depends on:** React only. It holds no app content and **never imports
  `@camp404/games`**.
- **Imported by:** `apps/web` (the console) and `apps/join` (the join site).
- **Theming:** only through the `--os-*` CSS variables. The console's themes
  are in `apps/web/lib/os-themes.ts`.

```bash
pnpm --filter @camp404/os test
```
