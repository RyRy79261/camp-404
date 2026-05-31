import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@camp404/ui/components/button";

// Next composes this with the root layout's template so the tab reads sensibly
// instead of inheriting the previous route's title on a client-side miss.
export const metadata: Metadata = { title: "Page not found" };

// Rendered for any unmatched route and for `notFound()` calls. It sits inside
// the root layout, so the user stays within the app shell (theme, providers)
// rather than dropping to Next's bare default 404.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <p className="text-7xl font-bold tracking-tight text-[color:var(--color-primary)]">
        404
      </p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">You&rsquo;re properly lost.</h1>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          This page wandered off into the dust. There&rsquo;s nothing here &mdash;
          but the camp&rsquo;s still standing.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Back to camp</Link>
      </Button>
    </main>
  );
}
