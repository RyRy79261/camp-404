import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface FormCardProps {
  href: string;
  title: string;
  description: string;
  /** Pre-formatted "last edited" date. */
  lastEdited: string;
}

// A tappable completed-form row on the My forms list (board S15): title +
// description + last-edited line, with a trailing chevron. App-local (uses
// next/link for SPA navigation into the replay view).
export function FormCard({
  href,
  title,
  description,
  lastEdited,
}: FormCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-subtitle-dense font-bold text-foreground">
          {title}
        </span>
        <span className="text-label text-muted-foreground">{description}</span>
        <span className="text-xs font-medium text-muted-foreground">
          Last edited {lastEdited}
        </span>
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </Link>
  );
}
