# @camp404/mobile

Capacitor 8 host that wraps the Next.js static export from `apps/web` into iOS and Android shells.

## First-time setup

```bash
pnpm --filter @camp404/web build:mobile   # MOBILE_BUILD=1 next build → ../web/out
pnpm --filter @camp404/mobile add:ios      # generates apps/mobile/ios/
pnpm --filter @camp404/mobile add:android  # generates apps/mobile/android/
pnpm --filter @camp404/mobile sync         # copies web build into native projects
```

## Each subsequent build

```bash
pnpm --filter @camp404/mobile build:native # rebuilds web + cap sync
pnpm --filter @camp404/mobile open:ios     # opens Xcode
pnpm --filter @camp404/mobile open:android # opens Android Studio
```

Mobile build is intentionally **not** part of the default `pnpm turbo run build` pipeline (it shares an output directory with the web build and requires native tooling). Run it manually with `build:native`.

## Notes

- Bundle ID: `com.camp-404.app`.
- App Store / Play submission is **deferred** (see brief §11). TestFlight + Play Internal only for now.
- iOS builds require a Mac with Xcode; Android builds require Android Studio.
- The `ios/` and `android/` directories are generated and gitignored once tooling is configured.
