import type { ReactNode } from "react";

/**
 * Consistent page title + description + optional right-aligned actions.
 *
 * Laid out by the page's own width (the page-* variants: a 404 OS window's
 * body, else the screen), so a narrow window stacks the actions under the
 * title instead of squeezing the title to one word a line. With room for
 * both, the actions sit on the right; when they no longer fit beside a
 * title of at least 18rem, they wrap under it.
 */
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      data-slot="page-heading"
      className="mb-6 flex flex-col gap-3 page-sm:flex-row page-sm:flex-wrap page-sm:items-end page-sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1 page-sm:flex-[1_1_18rem]">
        {eyebrow && (
          <p
            data-slot="page-eyebrow"
            className="font-mono text-xs uppercase tracking-[0.25em] text-accent"
          >
            {eyebrow}
          </p>
        )}
        <h1
          data-slot="page-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
