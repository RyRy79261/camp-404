import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { IconBadge } from "@camp404/ui/components/icon-badge";

// Board S27 Section A (design/spec/impl/components/molecule-completionhero.md):
// the check badge, the heading, and one of two next steps. A server component:
// it only renders links.

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
    <div className="flex w-full flex-col items-center gap-3.5 py-2 text-center">
      <IconBadge
        shape="circle"
        tone="accent"
        className="h-[88px] w-[88px] [&>svg]:h-10 [&>svg]:w-10"
      >
        <Check aria-hidden />
      </IconBadge>
      <h1 className="text-2xl font-bold text-foreground">
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
          <Button asChild className="w-full">
            <Link href={nextHref}>Start next questionnaire</Link>
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2 pt-4">
          <Button asChild className="w-full">
            <Link href="/">Back to camp</Link>
          </Button>
          <p className="text-caption text-muted-foreground">
            You&rsquo;re all caught up.
          </p>
        </div>
      )}
    </div>
  );
}
