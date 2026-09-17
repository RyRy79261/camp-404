import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";

interface FormCardProps {
  href: string;
  title: string;
  description: string;
  /** Pre-formatted "last edited" date. */
  lastEdited: string;
  /** Whether the answers can still be changed, or only read. */
  editable: boolean;
}

// A completed form on the My forms list, drawn as an AfrikaBurn directory card:
// the title and whether it can still change, the description, then the
// last-edited line with the way in. The whole card is the link.
export function FormCard({
  href,
  title,
  description,
  lastEdited,
  editable,
}: FormCardProps) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
          {title}
        </span>
        <Badge variant={editable ? "success" : "outline"} className="shrink-0">
          {editable ? "Editable" : "Submitted"}
        </Badge>
      </div>
      <span className="line-clamp-3 text-sm text-muted-foreground">
        {description}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">
          Last edited {lastEdited}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-accent">
          {editable ? "Update" : "View"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
