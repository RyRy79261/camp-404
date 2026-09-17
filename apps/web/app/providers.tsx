"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      // The app is dark-first (AfrikaBurn's "Tankwa Night" tokens). Left on
      // "system", next-themes swaps in the light palette on a light-mode OS.
      defaultTheme="dark"
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      redirectTo="/"
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
