import type { ReactNode } from "react";
import Link from "next/link";
import { Tent } from "lucide-react";

// The frame of the public policy pages (/privacy, /terms): the brand mark, a
// dated heading, sections of plain text, and a footer linking both. Public
// and static, because Google requires both links on the app's own domain
// before it offers "Sign in with Google", and anyone should be able to read
// them before signing up.

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold normal-case tracking-tight">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Tent className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Camp 404
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
            Last updated {updated}
          </p>
          <h1 className="text-3xl tracking-tight sm:text-4xl">{title}</h1>
          <p className="max-w-2xl text-base text-muted-foreground">{intro}</p>
        </div>
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <p className="text-sm font-medium text-foreground">Camp 404</p>
          <nav aria-label="Policies" className="flex items-center gap-4">
            {[
              ["/", "Home"],
              ["/privacy", "Privacy"],
              ["/terms", "Terms"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href!}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
