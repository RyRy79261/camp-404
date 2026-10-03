import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { cn } from "@camp404/ui/lib/utils";

/**
 * Which section a card sits in: a form the member keeps updating, a finished
 * questionnaire they can reread, or an optional one nobody has to answer
 * (#313).
 */
export type FormCardKind = "editable" | "submitted" | "optional";

interface FormCardProps {
  href: string;
  title: string;
  description: string;
  /** Pre-formatted "last edited" date; null when never saved. */
  lastEdited: string | null;
  kind: FormCardKind;
  /** An optional card only: the member saved part of it already. */
  started?: boolean;
}

const BADGE: Record<FormCardKind, string> = {
  editable: "Editable",
  submitted: "Submitted",
  optional: "Optional",
};

const ACTION: Record<FormCardKind, string> = {
  editable: "Update",
  submitted: "View",
  optional: "Answer",
};

// A form on the My forms list, drawn as an AfrikaBurn directory card: the
// title and what kind of form it is, the description, then the last-edited
// line with the way in. The whole card is the link. An optional questionnaire
// wears the desktop's blue and a filled "Answer" button, so it reads as an
// invitation rather than something already done.
export function FormCard({
  href,
  title,
  description,
  lastEdited,
  kind,
  started = false,
}: FormCardProps) {
  const optional = kind === "optional";
  const footnote = optional
    ? started
      ? "Started, not sent yet"
      : "Not answered"
    : lastEdited
      ? `Last edited ${lastEdited}`
      : "Not filled in yet";
  return (
    <Link
      href={href}
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        optional ? "border-os-accent/60" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
          {title}
        </span>
        <Badge
          variant={kind === "editable" ? "success" : "outline"}
          className={cn(
            "shrink-0",
            optional && "border-os-accent/60 text-os-accent",
          )}
        >
          {BADGE[kind]}
        </Badge>
      </div>
      <span className="line-clamp-3 text-sm text-muted-foreground">
        {description}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">{footnote}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium",
            optional
              ? "h-8 bg-primary px-3 text-primary-foreground"
              : "text-accent",
          )}
        >
          {ACTION[kind]}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
