import * as React from "react";
import { ChevronLeft } from "lucide-react";

import { cn } from "../lib/utils";

// The round back link in a DetailHeader's leading slot (boards S12, S13): a
// 40px muted circle with a chevron. It has no visible text, so `label` names
// where it goes ("Back to home"). Framework-agnostic: a plain anchor, or the
// app's link component through `linkAs`.
export interface BackButtonProps extends Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> {
  href: string;
  /** The accessible name, naming the destination. */
  label: string;
  /**
   * The link component to render, e.g. Next's `Link`, so navigation stays in
   * the app instead of reloading the page. A plain `<a>` when left out.
   */
  linkAs?: React.ElementType;
}

const BackButton = React.forwardRef<HTMLAnchorElement, BackButtonProps>(
  ({ label, className, linkAs: Link = "a", ...props }, ref) => (
    <Link
      ref={ref}
      aria-label={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <ChevronLeft className="h-5 w-5" aria-hidden />
    </Link>
  ),
);
BackButton.displayName = "BackButton";

export { BackButton };
