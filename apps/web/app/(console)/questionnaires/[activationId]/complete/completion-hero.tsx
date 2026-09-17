import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The completion screen's first section: the check, the heading, and one of two
// next steps. A server component: it only renders links.

export type CompletionHeroVariant = "all-done" | "more-required";

export function CompletionHero({
  variant,
  pendingCount = 0,
  nextHref,
}: {
  variant: CompletionHeroVariant;
  /** Required questionnaires still pending. Used by "more-required". */
  pendingCount?: number;
  /** The next required questionnaire. Used by "more-required". */
  nextHref?: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Questionnaire complete
      </h1>
      <p className="text-sm text-muted-foreground">
        Thanks — that&rsquo;s logged with the captains.
      </p>

      {variant === "more-required" && nextHref ? (
        <div className="flex w-full flex-col items-center gap-2 pt-4">
          <p className="text-sm font-semibold text-foreground">
            {pendingCount === 1
              ? "1 more required before you’re unlocked"
              : `${pendingCount} more required before you’re unlocked`}
          </p>
          <Button asChild className="w-full sm:w-auto">
            <Link href={nextHref}>Start next questionnaire</Link>
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2 pt-4">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/">Back to camp</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            You&rsquo;re all caught up.
          </p>
        </div>
      )}
    </div>
  );
}
