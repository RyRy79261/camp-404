"use client";

import type { ReactNode } from "react";

/**
 * The app's client providers. Empty today: Neon Auth's UI provider lived here
 * (and, through it, next-themes), and self-hosted Better Auth needs no
 * provider — `authClient.useSession()` works on its own. The page is dark
 * because `<html>` carries the `dark` class in app/layout.tsx; with next-themes
 * gone nothing can swap in the light palette on a light-mode OS.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
