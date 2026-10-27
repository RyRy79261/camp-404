import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";

// Two small parts the camp fees screens share (Who owes what, Camp money; the
// approved mock-up of 2026-10-27): four figures in one card (two by two on a
// phone, as DuesStats), and a row of filter chips that are links, so the
// filtered list stays a server render, is linkable and survives Back.
// Server-safe.

export interface MoneyFigure {
  term: string;
  value: string;
  hint: ReactNode;
  /** Money below zero: drawn in the warning colour. */
  negative?: boolean;
}

export function MoneyFigures({
  label,
  figures,
  className,
}: {
  label: string;
  figures: readonly MoneyFigure[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 page-sm:p-5">
        <dl
          aria-label={label}
          className="grid grid-cols-2 gap-x-6 gap-y-4 page-md:grid-cols-4"
        >
          {figures.map((f) => (
            <div
              key={f.term}
              role="group"
              aria-label={f.term}
              className="flex min-w-0 flex-col gap-0.5"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {f.term}
              </dt>
              <dd
                className={cn(
                  "text-lg font-bold tabular-nums page-sm:text-2xl",
                  f.negative && "text-destructive",
                )}
              >
                {f.value}
              </dd>
              <dd className="text-xs text-muted-foreground">{f.hint}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

const CHIP =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-primary bg-primary/15 text-foreground";

export interface FilterLink {
  href: string;
  label: string;
  /** Shown after the label, "(9)"; none for "Everyone". */
  count?: number;
  current: boolean;
}

export function FilterLinks({
  label,
  links,
  className,
}: {
  label: string;
  links: readonly FilterLink[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-slot="filter-chip"
          aria-current={link.current ? "page" : undefined}
          className={cn(CHIP, link.current && CHIP_ON)}
        >
          {link.label}
          {link.count !== undefined && (
            <span
              data-slot="filter-chip-count"
              className={cn(
                "tabular-nums",
                link.current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              ({link.count})
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
